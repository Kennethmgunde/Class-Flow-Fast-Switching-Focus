// On-device storage for classes, learners, sessions and attempts (IndexedDB).
//
// Everything stays on the tablet: no accounts, no server copy. Learners are
// stored by first name and avatar only. Deleting a learner or a class also
// deletes their attempts, so the teacher can wipe data (TRA-808).

import type { Evaluation } from './capt.ts'

export type ClassRoom = { id: string; name: string; createdAt: number }

export type Learner = {
  id: string
  classId: string
  name: string // first name only
  avatar: string // an emoji or picture key, so non-readers can find themselves
  createdAt: number
}

// One practice period. "Who hasn't had a turn" is counted per session.
export type Session = { id: string; classId: string; startedAt: number; endedAt?: number }

export type Attempt = {
  id: string
  learnerId: string
  classId: string
  sessionId: string
  referenceText: string
  promptId?: string
  at: number
  evaluation: Evaluation // overall, per-word and per-sound scores from CAPT
}

export type NewAttempt = Omit<Attempt, 'id' | 'classId' | 'at'> & { at?: number }

const DB_NAME = 'class-flow'
const DB_VERSION = 1

export class Store {
  private readonly db: IDBDatabase

  private constructor(db: IDBDatabase) {
    this.db = db
  }

  // `factory` is the browser's indexedDB by default; tests pass a fake.
  static async open(name = DB_NAME, factory: IDBFactory = globalThis.indexedDB): Promise<Store> {
    const req = factory.open(name, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('classes', { keyPath: 'id' })
      db.createObjectStore('learners', { keyPath: 'id' }).createIndex('classId', 'classId')
      db.createObjectStore('sessions', { keyPath: 'id' }).createIndex('classId', 'classId')
      const attempts = db.createObjectStore('attempts', { keyPath: 'id' })
      attempts.createIndex('learnerId', 'learnerId')
      attempts.createIndex('classId', 'classId')
      attempts.createIndex('sessionId', 'sessionId')
    }
    return new Store(await done(req))
  }

  close(): void {
    this.db.close()
  }

  // Classes

  async addClass(name: string, now = Date.now()): Promise<ClassRoom> {
    const c: ClassRoom = { id: newId(), name, createdAt: now }
    await this.write(['classes'], (tx) => tx.objectStore('classes').add(c))
    return c
  }

  async listClasses(): Promise<ClassRoom[]> {
    return byTime(await this.all<ClassRoom>('classes'), (c) => c.createdAt)
  }

  // Deletes the class with all its learners, sessions and attempts.
  async deleteClass(classId: string): Promise<void> {
    await this.write(['classes', 'learners', 'sessions', 'attempts'], (tx) => {
      tx.objectStore('classes').delete(classId)
      for (const store of ['learners', 'sessions', 'attempts']) deleteWhere(tx.objectStore(store).index('classId'), classId)
    })
  }

  // Learners

  async addLearner(classId: string, name: string, avatar: string, now = Date.now()): Promise<Learner> {
    const l: Learner = { id: newId(), classId, name: name.trim(), avatar, createdAt: now }
    await this.write(['learners'], (tx) => tx.objectStore('learners').add(l))
    return l
  }

  async getLearner(learnerId: string): Promise<Learner | undefined> {
    return this.get<Learner>('learners', learnerId)
  }

  // Alphabetical, so the teacher can scan the roster quickly.
  async listLearners(classId: string): Promise<Learner[]> {
    const learners = await this.allWhere<Learner>('learners', 'classId', classId)
    return learners.sort((a, b) => a.name.localeCompare(b.name))
  }

  // Deletes the learner and all their attempts.
  async deleteLearner(learnerId: string): Promise<void> {
    await this.write(['learners', 'attempts'], (tx) => {
      tx.objectStore('learners').delete(learnerId)
      deleteWhere(tx.objectStore('attempts').index('learnerId'), learnerId)
    })
  }

  // Sessions

  // Starts a session, ending any session still open for the class.
  async startSession(classId: string, now = Date.now()): Promise<Session> {
    const open = await this.currentSession(classId)
    const s: Session = { id: newId(), classId, startedAt: now }
    await this.write(['sessions'], (tx) => {
      const sessions = tx.objectStore('sessions')
      if (open) sessions.put({ ...open, endedAt: now })
      sessions.add(s)
    })
    return s
  }

  async endSession(sessionId: string, now = Date.now()): Promise<void> {
    await this.write(['sessions'], (tx) => {
      const sessions = tx.objectStore('sessions')
      const req = sessions.get(sessionId)
      req.onsuccess = () => {
        if (req.result && !req.result.endedAt) sessions.put({ ...req.result, endedAt: now })
      }
    })
  }

  async currentSession(classId: string): Promise<Session | undefined> {
    return (await this.listSessions(classId)).filter((s) => !s.endedAt).at(-1)
  }

  async listSessions(classId: string): Promise<Session[]> {
    return byTime(await this.allWhere<Session>('sessions', 'classId', classId), (s) => s.startedAt)
  }

  // Attempts

  async addAttempt(attempt: NewAttempt): Promise<Attempt> {
    const learner = await this.get<Learner>('learners', attempt.learnerId)
    if (!learner) throw new Error(`unknown learner ${attempt.learnerId}`)
    // `at` can be set explicitly to seed past sessions for the demo (TRA-810).
    const a: Attempt = { ...attempt, id: newId(), classId: learner.classId, at: attempt.at ?? Date.now() }
    await this.write(['attempts'], (tx) => tx.objectStore('attempts').add(a))
    return a
  }

  // A learner's attempts, oldest first.
  async attemptsForLearner(learnerId: string): Promise<Attempt[]> {
    return byTime(await this.allWhere<Attempt>('attempts', 'learnerId', learnerId), (a) => a.at)
  }

  async attemptsForSession(sessionId: string): Promise<Attempt[]> {
    return byTime(await this.allWhere<Attempt>('attempts', 'sessionId', sessionId), (a) => a.at)
  }

  async attemptsForClass(classId: string): Promise<Attempt[]> {
    return byTime(await this.allWhere<Attempt>('attempts', 'classId', classId), (a) => a.at)
  }

  // Helpers

  private get<T>(store: string, id: string): Promise<T | undefined> {
    return done(this.db.transaction(store).objectStore(store).get(id))
  }

  private all<T>(store: string): Promise<T[]> {
    return done(this.db.transaction(store).objectStore(store).getAll())
  }

  private allWhere<T>(store: string, index: string, value: string): Promise<T[]> {
    return done(this.db.transaction(store).objectStore(store).index(index).getAll(value))
  }

  // Runs `fn` in one read-write transaction and waits for it to commit.
  private write(stores: string[], fn: (tx: IDBTransaction) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(stores, 'readwrite')
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'))
      fn(tx)
    })
  }
}

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function deleteWhere(index: IDBIndex, value: string): void {
  const req = index.openKeyCursor(IDBKeyRange.only(value))
  req.onsuccess = () => {
    const cursor = req.result
    if (!cursor) return
    index.objectStore.delete(cursor.primaryKey)
    cursor.continue()
  }
}

function byTime<T>(items: T[], time: (item: T) => number): T[] {
  return items.sort((a, b) => time(a) - time(b))
}

// crypto.randomUUID needs a secure context; getRandomValues works everywhere,
// including a tablet on plain http during testing.
function newId(): string {
  const b = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}
