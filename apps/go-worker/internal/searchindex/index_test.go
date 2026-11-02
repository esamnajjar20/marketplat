package searchindex

import (
	"testing"
	"time"
)

func TestIsFreshRejectsMissingTimestamp(t *testing.T) {
	if IsFresh(nil, time.Now().UTC()) {
		t.Fatal("nil refresh timestamp must be stale")
	}
}

func TestIsFreshAcceptsTimestampInsideWindow(t *testing.T) {
	now := time.Date(2026, 11, 2, 1, 0, 0, 0, time.UTC)
	refreshed := now.Add(-FreshnessWindow + time.Second)
	if !IsFresh(&refreshed, now) {
		t.Fatal("refresh timestamp inside freshness window should be fresh")
	}
}

func TestIsFreshRejectsOldAndFutureTimestamps(t *testing.T) {
	now := time.Date(2026, 11, 2, 1, 0, 0, 0, time.UTC)
	old := now.Add(-FreshnessWindow - time.Second)
	future := now.Add(time.Second)
	if IsFresh(&old, now) {
		t.Fatal("old refresh timestamp must be stale")
	}
	if IsFresh(&future, now) {
		t.Fatal("future refresh timestamp must be rejected")
	}
}
