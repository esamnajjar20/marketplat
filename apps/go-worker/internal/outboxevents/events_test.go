package outboxevents

import (
	"context"
	"errors"
	"testing"
)

func TestRunRejectsMissingLeaseIdentityBeforeDatabaseAccess(t *testing.T) {
	_, err := Run(context.Background(), nil, Request{EventID: "", WorkerID: "worker"})
	if err == nil {
		t.Fatal("expected missing event id to fail")
	}
	if errors.Is(err, ErrEventNotOwned) {
		t.Fatal("validation error must not be reported as a lease conflict")
	}
}

func TestCacheGenerationWorkerRejectsMissingLeaseIdentityBeforeDatabaseAccess(t *testing.T) {
	_, err := RunWithCacheRedis(context.Background(), nil, Request{EventID: "", WorkerID: "worker"}, nil)
	if err == nil {
		t.Fatal("expected missing event id to fail")
	}
	if errors.Is(err, ErrEventNotOwned) {
		t.Fatal("validation error must not be reported as a lease conflict")
	}
}

func TestSupportedEventTypesAreExplicit(t *testing.T) {
	if UserActivityEvent != "USER_ACTIVITY_RECORD" ||
		FollowedActivityEvent != "FOLLOWED_ACTIVITY_NOTIFICATION" ||
		SavedSearchMatchEvent != "SAVED_SEARCH_MATCH_NOTIFICATION" ||
		CacheGenerationBumpEvent != "CACHE_GENERATION_BUMP" {
		t.Fatal("outbox event contract changed unexpectedly")
	}
}
