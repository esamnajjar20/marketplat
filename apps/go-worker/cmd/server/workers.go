package main

import (
	"context"
	"sync"
	"time"

	"marketplat/apps/go-worker/internal/outboxworker"
	"marketplat/apps/go-worker/internal/pushdispatch"
)

const pushDispatchReadyRetryDelay = 10 * time.Second

// startBackgroundWorkers launches every enabled long-running consumer and
// returns a channel that closes once all of them have exited. Each worker
// stops when ctx is cancelled.
func (s *server) startBackgroundWorkers(ctx context.Context) <-chan struct{} {
	var workers sync.WaitGroup
	start := func(run func(context.Context)) {
		workers.Add(1)
		go func() {
			defer workers.Done()
			run(ctx)
		}()
	}
	if s.outboxEnabled {
		start(s.runOutboxWorker)
	}
	if s.searchIndexEnabled {
		start(s.runSearchIndexWorker)
	}
	if s.pushDispatchEnabled {
		start(s.runPushDispatchWorker)
	}

	done := make(chan struct{})
	go func() {
		workers.Wait()
		close(done)
	}()
	return done
}

func (s *server) runOutboxWorker(ctx context.Context) {
	worker := outboxworker.New(s.db, s.cacheRedisConfig, s.logger, outboxworker.Config{APIBaseURL: s.apiBaseURL, APIToken: s.token, LoadTracker: s.load})
	if err := worker.Run(ctx); err != nil && ctx.Err() == nil {
		s.logger.Error("Go transactional outbox worker exited unexpectedly", "error", err)
	}
}

// runPushDispatchWorker waits until the schema/config readiness check passes
// before flagging itself active, so Express keeps dispatching pushes until Go
// can genuinely take over.
func (s *server) runPushDispatchWorker(ctx context.Context) {
	worker := pushdispatch.New(s.db, s.logger, pushdispatch.Config{APIBaseURL: s.apiBaseURL, APIToken: s.token, FCM: s.fcmPush, LoadTracker: s.load})
	for ctx.Err() == nil {
		readyCtx, readyCancel := context.WithTimeout(ctx, 5*time.Second)
		readyErr := worker.CheckReady(readyCtx)
		readyCancel()
		if readyErr == nil {
			break
		}
		s.logger.Warn("Go push dispatch worker is not ready; Express fallback remains active", "error", readyErr)
		select {
		case <-ctx.Done():
			return
		case <-time.After(pushDispatchReadyRetryDelay):
		}
	}
	if ctx.Err() != nil {
		return
	}
	s.pushDispatchActive.Store(true)
	defer s.pushDispatchActive.Store(false)
	if err := worker.Run(ctx); err != nil && ctx.Err() == nil {
		s.logger.Error("Go notification push dispatch worker exited unexpectedly; Express fallback remains active", "error", err)
	}
}
