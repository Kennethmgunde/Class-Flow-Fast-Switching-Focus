// Command server serves the Class-Flow web app and forwards CAPT calls to the
// Cobalt demo server. The browser can't call CAPT directly because the demo
// server sends no CORS headers, so every CAPT request goes through here.
package main

import (
	"flag"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

func main() {
	addr := flag.String("addr", ":8080", "address to listen on")
	captURL := flag.String("capt", "https://demo.cobaltspeech.com/capt/api/capt/v1", "CAPT REST/WebSocket base URL")
	webDir := flag.String("web", "../web/dist", "built web app to serve")
	flag.Parse()

	target, err := url.Parse(*captURL)
	if err != nil {
		log.Fatalf("invalid -capt URL: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/api/capt/", captProxy(target))
	mux.Handle("/", http.FileServer(http.Dir(*webDir)))

	log.Printf("listening on %s, forwarding /api/capt/ to %s", *addr, target)
	log.Fatal(http.ListenAndServe(*addr, mux))
}

// captProxy forwards /api/capt/<path> to <target>/<path>. ReverseProxy also
// handles WebSocket upgrades, so /api/capt/streaming-evaluate works too.
func captProxy(target *url.URL) http.Handler {
	return &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(target)
			r.Out.URL.Path = target.Path + strings.TrimPrefix(r.In.URL.Path, "/api/capt")
			r.Out.URL.RawPath = ""
			// The upstream sees this server, not the browser, as the caller.
			r.Out.Header.Del("Origin")
		},
	}
}
