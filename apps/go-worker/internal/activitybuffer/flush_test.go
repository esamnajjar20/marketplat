package activitybuffer

import (
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
