// Plays the spoken clip for a prompt, so children who can't read yet can
// hear the sentence. Clips ship with the app (public/prompts/, made by
// tools/make-prompt-audio.ts), so playback never waits on a server.

export function promptAudioUrl(promptId: string): string {
  return `${import.meta.env.BASE_URL}prompts/${promptId}.wav`
}

export class PromptPlayer {
  private readonly audio = new Audio()
  private readonly onChange: () => void
  playing = false

  // `onChange` runs when playback starts or stops, to redraw the button.
  constructor(onChange: () => void) {
    this.onChange = onChange
    this.audio.preload = 'auto'
    this.audio.addEventListener('ended', () => this.setPlaying(false))
    this.audio.addEventListener('error', () => this.setPlaying(false))
  }

  // Loads the next clip ahead of time, so it starts instantly.
  preload(promptId: string): void {
    void fetch(promptAudioUrl(promptId)).catch(() => {})
  }

  async play(promptId: string): Promise<void> {
    this.audio.src = promptAudioUrl(promptId)
    try {
      this.setPlaying(true)
      await this.audio.play()
    } catch {
      // Autoplay blocked or clip missing: the Listen button still works.
      this.setPlaying(false)
    }
  }

  stop(): void {
    this.audio.pause()
    this.setPlaying(false)
  }

  private setPlaying(playing: boolean): void {
    if (this.playing === playing) return
    this.playing = playing
    this.onChange()
  }
}
