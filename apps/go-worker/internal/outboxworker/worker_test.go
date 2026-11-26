package outboxworker

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"testing"
	"time"

	"marketplat/apps/go-worker/internal/outboxevents"
	"marketplat/apps/go-worker/internal/rediswire"
)

func TestEventTypesAreExplicitAndSupported(t *testing.T) {
	want := []string{
		outboxevents.UserActivityEvent,
		outboxevents.FollowedActivityEvent,
		outboxevents.SavedSearchMatchEvent,
		outboxevents.CacheGenerationBumpEvent,
	}
	if len(EventTypes) != len(want) {
		t.Fatalf("expected %d allowlisted event types, got %d", len(want), len(EventTypes))
	}
	for i := range want {
		if EventTypes[i] != want[i] {
			t.Fatalf("event type %d = %q, want %q", i, EventTypes[i], want[i])
		}
	}
}

func TestRetryDelayMatchesExpressBackoffAndCapsAtOneHour(t *testing.T) {
	cases := []struct {
		attempt int
		want    time.Duration
	}{
		{attempt: 0, want: time.Second},
		{attempt: 1, want: time.Second},
		{attempt: 2, want: 2 * time.Second},
		{attempt: 3, want: 4 * time.Second},
		{attempt: 10, want: 512 * time.Second},
		{attempt: 12, want: 2048 * time.Second},
		{attempt: 13, want: time.Hour},
		{attempt: 25, want: time.Hour},
	}
	for _, test := range cases {
		if got := retryDelay(test.attempt); got != test.want {
			t.Errorf("retryDelay(%d) = %s, want %s", test.attempt, got, test.want)
		}
	}
}

func TestLeaseAndRetryLimitsRemainBounded(t *testing.T) {
	if leaseDuration != 120*time.Second {
		t.Fatalf("leaseDuration changed: %s", leaseDuration)
	}
	if leaseHeartbeatInterval >= leaseDuration/2 {
		t.Fatalf("heartbeat interval %s must remain below half the lease duration", leaseHeartbeatInterval)
	}
	if maxProcessingAttempts != 25 {
		t.Fatalf("max attempts changed: %d", maxProcessingAttempts)
	}
	if processedRetention != 30*24*time.Hour {
		t.Fatalf("processed retention changed: %s", processedRetention)
	}
}

func TestSplitNotificationBatchesRespectsCountAndSerializedSize(t *testing.T) {
	notifications := make([]outboxevents.Notification, 0, 30)
	for i := 0; i < 30; i++ {
		data := fmt.Sprintf(`{"description":"%s"}`, strings.Repeat("x", 2200))
		notifications = append(notifications, outboxevents.Notification{
			ID:     fmt.Sprintf("notification-%02d", i),
			UserID: "user-id",
			Type:   "FOLLOWED_USER_ACTIVITY",
			Title:  "title",
			Body:   "body",
			Data:   []byte(data),
		})
	}

	batches, err := splitNotificationBatches("event-id", notifications, callbackBatchSize, callbackMaxPayloadSize)
	if err != nil {
		t.Fatalf("splitNotificationBatches returned error: %v", err)
	}
	if len(batches) < 2 {
		t.Fatalf("expected large notifications to split into multiple batches, got %d", len(batches))
	}
	seen := 0
	for index, batch := range batches {
		if len(batch) == 0 || len(batch) > callbackBatchSize {
			t.Fatalf("batch %d has invalid item count %d", index, len(batch))
		}
		payload, err := json.Marshal(publishRequest{EventID: "event-id", Notifications: batch})
		if err != nil {
			t.Fatal(err)
		}
		if len(payload) > callbackMaxPayloadSize {
			t.Fatalf("batch %d exceeds serialized size limit: %d", index, len(payload))
		}
		seen += len(batch)
	}
	if seen != len(notifications) {
		t.Fatalf("batched %d of %d notifications", seen, len(notifications))
	}
}

func TestSplitNotificationBatchesRejectsSingleOversizedNotification(t *testing.T) {
	notification := outboxevents.Notification{
		ID: "notification-id", UserID: "user-id", Type: "FOLLOWED_USER_ACTIVITY",
		Title: "title", Body: "body", Data: []byte(fmt.Sprintf(`{"description":"%s"}`, strings.Repeat("x", callbackMaxPayloadSize))),
	}
	if _, err := splitNotificationBatches("event-id", []outboxevents.Notification{notification}, callbackBatchSize, callbackMaxPayloadSize); err == nil {
		t.Fatal("expected oversized notification to be rejected")
	}
}

func TestCheckReadyRejectsMissingDatabaseAndCallbackConfig(t *testing.T) {
	worker := New(nil, nil, nil, Config{})
	if err := worker.CheckReady(context.Background()); err == nil || !strings.Contains(err.Error(), "database") {
		t.Fatalf("CheckReady error = %v, want missing database error", err)
	}
}

func TestCheckCacheRedisRequiresHealthyPing(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	serverDone := make(chan error, 1)
	go func() {
		connection, acceptErr := listener.Accept()
		if acceptErr != nil {
			serverDone <- acceptErr
			return
		}
		defer connection.Close()
		reader := bufio.NewReader(connection)
		for i := 0; i < 3; i++ {
			if _, readErr := reader.ReadString('\n'); readErr != nil {
				serverDone <- readErr
				return
			}
		}
		_, writeErr := connection.Write([]byte("+PONG\r\n"))
		serverDone <- writeErr
	}()

	pool := rediswire.NewPool(&rediswire.Config{Addr: listener.Addr().String()}, 1)
	defer pool.Close()
	worker := &Worker{cacheRedisPool: pool}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if err := worker.checkCacheRedis(ctx); err != nil {
		t.Fatalf("checkCacheRedis returned error for healthy Redis: %v", err)
	}
	if err := <-serverDone; err != nil {
		t.Fatalf("fake Redis server failed: %v", err)
	}
}

func TestCheckCacheRedisRejectsMissingPool(t *testing.T) {
	worker := &Worker{}
	if err := worker.checkCacheRedis(context.Background()); err == nil || !strings.Contains(err.Error(), "pool") {
		t.Fatalf("checkCacheRedis error = %v, want missing pool error", err)
	}
}
