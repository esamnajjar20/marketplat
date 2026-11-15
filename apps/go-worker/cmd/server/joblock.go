package main

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

const (
	// defaultLockedJobTimeout bounds ordinary write-capable jobs.
	defaultLockedJobTimeout = 90 * time.Second
	// maintenanceJobTimeout leaves a response window before the Express
	// caller's 9-minute timeout for long batch-deleting retention jobs.
	maintenanceJobTimeout = 8*time.Minute + 30*time.Second
)

type lockedJobRunner func(context.Context, *sql.Conn) (any, error)

// lockedJob describes one write-capable job executed under a PostgreSQL
// advisory lock. The Go and Express implementations share the lock ID, so
// timeout ambiguity can never start two copies of the same job.
type lockedJob struct {
	lockID  int64
	name    string // used in logs, the lock-release warning and the 500 message
	timeout time.Duration
	run     lockedJobRunner
}

// tryLocalJobGate avoids queueing duplicate requests behind a one-connection
// database pool. PostgreSQL advisory locks remain the cross-process authority.
func (s *server) tryLocalJobGate(lockID int64) (release func(), acquired bool) {
	value, _ := s.jobGates.LoadOrStore(lockID, &sync.Mutex{})
	gate := value.(*sync.Mutex)
	if !gate.TryLock() {
		return nil, false
	}
	return gate.Unlock, true
}

// heldJobLock is a session-level advisory lock plus the dedicated connection
// and process-local gate that protect it. Closing it always releases all three
// in the order unlock, connection, gate.
type heldJobLock struct {
	conn        *sql.Conn
	lockID      int64
	name        string
	logger      *slog.Logger
	locked      bool
	releaseGate func()
}

// unlock releases the advisory lock exactly once. Jobs call it before writing
// their response so an Express fallback triggered by a failed response cannot
// race the job's final batch.
func (l *heldJobLock) unlock() {
	if !l.locked {
		return
	}
	l.locked = false
	releaseAdvisoryLock(l.conn, l.lockID, l.name, l.logger)
}

func (l *heldJobLock) close() {
	l.unlock()
	_ = l.conn.Close()
	l.releaseGate()
}

// acquireJobLock takes the local gate, a dedicated connection and the
// advisory lock. When it reports false the HTTP response has already been
// written (409 for a job that is already running, 503 for database trouble).
func (s *server) acquireJobLock(w http.ResponseWriter, r *http.Request, lockID int64, name string) (*heldJobLock, bool) {
	releaseGate, gateAcquired := s.tryLocalJobGate(lockID)
	if !gateAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return nil, false
	}

	conn, err := s.db.Conn(r.Context())
	if err != nil {
		releaseGate()
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return nil, false
	}

	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, lockID).Scan(&acquired); err != nil {
		_ = conn.Close()
		releaseGate()
		writeError(w, http.StatusServiceUnavailable, "could not acquire job lock")
		return nil, false
	}
	if !acquired {
		_ = conn.Close()
		releaseGate()
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return nil, false
	}
	return &heldJobLock{conn: conn, lockID: lockID, name: name, logger: s.logger, locked: true, releaseGate: releaseGate}, true
}

// executeLockedJob is the shared control plane for scheduled jobs: it acquires
// the lock, runs the job with a deadline, releases the lock, then responds.
// Callers authenticate and validate the request before calling it.
func (s *server) executeLockedJob(w http.ResponseWriter, r *http.Request, job lockedJob) {
	lock, ok := s.acquireJobLock(w, r, job.lockID, job.name)
	if !ok {
		return
	}
	defer lock.close()

	ctx, cancel := context.WithTimeout(r.Context(), job.timeout)
	result, err := job.run(ctx, lock.conn)
	cancel()
	lock.unlock()
	if err != nil {
		s.logger.Error(job.name+" job failed", "error", err, "result", result)
		writeError(w, http.StatusInternalServerError, job.name+" failed")
		return
	}
	s.logger.Info(job.name+" job completed", "result", result)
	writeJSON(w, http.StatusOK, result)
}

// runLockedSQLJob authenticates, requires an empty JSON object body and runs
// the job under its advisory lock with the default timeout.
func (s *server) runLockedSQLJob(w http.ResponseWriter, r *http.Request, lockID int64, name string, run lockedJobRunner) {
	s.runLockedSQLJobWithTimeout(w, r, lockID, name, defaultLockedJobTimeout, run)
}

func (s *server) runLockedSQLJobWithTimeout(w http.ResponseWriter, r *http.Request, lockID int64, name string, timeout time.Duration, run lockedJobRunner) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if !requireEmptyJSONObject(w, r, 1024) {
		return
	}
	s.executeLockedJob(w, r, lockedJob{lockID: lockID, name: name, timeout: timeout, run: run})
}

// releaseAdvisoryLock discards the database/sql connection if unlocking fails.
// Returning a session-level advisory lock to the pool would otherwise leave it
// attached to an idle pooled connection.
func releaseAdvisoryLock(conn *sql.Conn, lockID int64, jobName string, logger *slog.Logger) {
	unlockCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var unlocked bool
	if err := conn.QueryRowContext(unlockCtx, `SELECT pg_advisory_unlock($1)`, lockID).Scan(&unlocked); err != nil || !unlocked {
		logger.Warn(jobName+" advisory lock release failed; discarding database connection", "error", err)
		_ = conn.Raw(func(any) error { return driver.ErrBadConn })
	}
}
