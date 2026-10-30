package sellerresponse

import (
	"strings"
	"testing"
)

func TestUpdateSQLPreservesWindowAndFirstReplySemantics(t *testing.T) {
	for _, fragment := range []string{
		`DISTINCT ON (m."conversationId")`,
		`m."senderId" = c."buyerId"`,
		`m."createdAt" >= $1`,
		`m."senderId" = fbm."sellerId"`,
		`ROUND(aggregated."avgResponseMinutes")::int`,
		`WHERE profile."userId" = aggregated."sellerId"`,
	} {
		if !strings.Contains(UpdateSQLForTest(), fragment) {
			t.Fatalf("expected query to contain %q", fragment)
		}
	}
}

func TestUpdateSQLLeavesSellersWithoutRecentConversationsUntouched(t *testing.T) {
	q := UpdateSQLForTest()
	if !strings.Contains(q, "FROM aggregated") || !strings.Contains(q, "WITH first_buyer_msg") {
		t.Fatal("expected update to be restricted to sellers included in the 90-day aggregate")
	}
}
