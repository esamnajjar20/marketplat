// Package loadtracker exposes a lightweight per-process concurrency signal to
// the authenticated internal gateway. It intentionally avoids OS-specific CPU
// sampling and adds no polling goroutines or background work.
package loadtracker

import (
	"net/http"
	"strconv"
	"sync"
	"sync/atomic"
)

const HeaderName = "X-MP-Worker-Active-Requests"

// Tracker counts requests currently being served by one Go process.
type Tracker struct {
	active atomic.Int64
}

func New() *Tracker { return &Tracker{} }

func (t *Tracker) Active() int64 {
	if t == nil {
		return 0
	}
	return t.active.Load()
}

// Begin marks one background unit of work as active. The returned release
// function is safe to defer and idempotent, including shutdown/error paths.
func (t *Tracker) Begin() func() {
	if t == nil {
		return func() {}
	}
	t.active.Add(1)
	var once sync.Once
	return func() {
		once.Do(func() { t.active.Add(-1) })
	}
}

// Middleware adds the active-request count before the handler writes headers,
// so a reverse proxy can use it as a low-cost, real-time load hint.
func (t *Tracker) Middleware(next http.Handler) http.Handler {
	if t == nil {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		release := t.Begin()
		defer release()
		active := t.Active()
		if len(r.URL.Path) >= len("/internal/") && r.URL.Path[:len("/internal/")] == "/internal/" {
			w.Header().Set(HeaderName, strconv.FormatInt(active, 10))
		}
		next.ServeHTTP(w, r)
	})
}
