package salesjobs

import (
	"strings"
	"testing"
)

func TestSalesJobsAreIdempotentAndCreateDurablePushDispatches(t *testing.T) {
	for _, job := range []string{DailyReminder, DebtReminder, OverdueInstallments, WeeklyReport} {
		q := SQLForTest(job)
		for _, fragment := range []string{`ON CONFLICT ("idempotencyKey") DO NOTHING`, `INSERT INTO "notification_push_dispatches"`, `RETURNING "id"`} {
			if !strings.Contains(q, fragment) {
				t.Fatalf("%s query missing %q", job, fragment)
			}
		}
	}
}

func TestSalesJobsRespectPreferenceDefaultsAndCandidateCaps(t *testing.T) {
	checks := map[string][]string{
		DailyReminder:       {`'salesAlerts'`, `COALESCE`, `NOT EXISTS`},
		DebtReminder:        {`'debtAlerts'`, `LIMIT 2000`, `DISTINCT ON (l."sellerId")`},
		OverdueInstallments: {`'installmentAlerts'`, `LIMIT 1000`, `IN ('PENDING', 'PARTIAL')`},
		WeeklyReport:        {`'weeklySalesReport'`, `INTERVAL '7 days'`},
	}
	for job, fragments := range checks {
		q := SQLForTest(job)
		for _, fragment := range fragments {
			if !strings.Contains(q, fragment) {
				t.Fatalf("%s query missing %q", job, fragment)
			}
		}
	}
}
