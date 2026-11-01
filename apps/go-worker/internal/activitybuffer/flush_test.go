package activitybuffer

import (
	"context"
	"encoding/json"
	"testing"
	"time"
)

func TestValidEntryAcceptsOnlyKnownActivityAndEntityTypes(t *testing.T) {
	item := entry{UserID: "u1", Type: "AD_CREATED", Title: "تم إنشاء الإعلان", IdempotencyKey: "i1", CreatedAt: time.Now()}
	if !validEntry(item) {
		t.Fatal("expected valid activity entry")
	}
	item.Type = "UNKNOWN"
	if validEntry(item) {
		t.Fatal("unknown activity type must be rejected")
	}
	item.Type = "AD_CREATED"
	entity := "PAYMENT"
	item.EntityType = &entity
	if validEntry(item) {
		t.Fatal("unknown entity type must be rejected")
	}
	item.EntityType = nil
	item.Metadata = json.RawMessage(`{invalid`)
	if validEntry(item) {
		t.Fatal("invalid metadata JSON must be rejected")
	}
}

type compensationContextKey struct{}

func TestCompensationContextSurvivesCallerCancellationAndIsBounded(t *testing.T) {
	parent, cancelParent := context.WithCancel(context.WithValue(context.Background(), compensationContextKey{}, "activity-flush"))
	cancelParent()
	ctx, cancel := compensationContext(parent)
	defer cancel()
	if err := ctx.Err(); err != nil {
		t.Fatalf("compensation context inherited caller cancellation: %v", err)
	}
	if got := ctx.Value(compensationContextKey{}); got != "activity-flush" {
		t.Fatalf("compensation context lost context value: %v", got)
	}
	deadline, ok := ctx.Deadline()
	if !ok || time.Until(deadline) > 3*time.Second || time.Until(deadline) <= 0 {
		t.Fatalf("compensation deadline is not bounded to 3s: %v", deadline)
	}
}
