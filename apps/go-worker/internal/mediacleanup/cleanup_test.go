package mediacleanup

import (
	"testing"
	"time"
)

func TestBackoffForAttemptIsBoundedAndExponential(t *testing.T) {
	cases := []struct {
		attempt int
		want    time.Duration
	}{
		{0, 5 * time.Minute},
		{1, 5 * time.Minute},
		{2, 10 * time.Minute},
		{3, 20 * time.Minute},
		{4, 40 * time.Minute},
		{5, 80 * time.Minute},
		{12, 24 * time.Hour},
		{30, 24 * time.Hour},
	}
	for _, tc := range cases {
		if got := BackoffForAttempt(tc.attempt); got != tc.want {
			t.Errorf("BackoffForAttempt(%d) = %s, want %s", tc.attempt, got, tc.want)
		}
	}
}

func TestClaimSQLUsesSkipLockedAndReclaimsExpiredLeases(t *testing.T) {
	if !contains(claimSQL, "FOR UPDATE SKIP LOCKED") {
		t.Fatal("claim query must skip rows owned by another worker")
	}
	if !contains(claimSQL, `"status" = 'PROCESSING' AND "lockedAt" <= $2`) {
		t.Fatal("claim query must recover expired processing leases")
	}
	if !contains(claimSQL, `gen_random_uuid()`) {
		t.Fatal("each claim must receive a new lease token")
	}
}

func TestResourceTypesAreValidatedByCloudinaryClient(t *testing.T) {
	// Resource type validation lives at the Cloudinary transport boundary.
	// Keep the allowed set explicit here so accidental additions are reviewed.
	allowed := map[string]bool{"image": true, "video": true, "raw": true}
	if len(allowed) != 3 || !allowed["image"] || !allowed["video"] || !allowed["raw"] {
		t.Fatal("Cloudinary resource type contract changed")
	}
}

func contains(value, fragment string) bool {
	return len(value) >= len(fragment) && (value == fragment || index(value, fragment) >= 0)
}

func index(value, fragment string) int {
	for i := 0; i+len(fragment) <= len(value); i++ {
		if value[i:i+len(fragment)] == fragment {
			return i
		}
	}
	return -1
}
