// Package fraudmonitor provides bounded, read-only abuse-pattern scans over
// existing moderation data. Findings are review hints, never automatic bans,
// suspensions, or content takedowns.
package fraudmonitor

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

const (
	SampleLimit              = 10
	StatementTimeout         = "12s"
	TransactionTimeout       = 18 * time.Second
	AdvisoryLockID     int64 = 731904303
)

var ErrAlreadyRunning = errors.New("fraud monitor scan is already running")

type Sample map[string]any

type CheckDefinition struct {
	Code        string
	Severity    string
	Title       string
	Description string
	EntityType  string
	Query       string
}

type CheckResult struct {
	Code        string   `json:"code"`
	Severity    string   `json:"severity"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	EntityType  string   `json:"entityType"`
	Count       int64    `json:"count"`
	Samples     []Sample `json:"samples"`
}

type SeveritySummary struct {
	Critical int64 `json:"critical"`
	Warning  int64 `json:"warning"`
	Info     int64 `json:"info"`
}

type Report struct {
	Mode           string          `json:"mode"`
	ScannedAt      time.Time       `json:"scannedAt"`
	DurationMillis int64           `json:"durationMillis"`
	CheckCount     int             `json:"checkCount"`
	FindingCount   int64           `json:"findingCount"`
	BySeverity     SeveritySummary `json:"bySeverity"`
	Checks         []CheckResult   `json:"checks"`
}

// Definitions contains intentionally conservative heuristics. Report volume
// and signal volume are not proof of abuse; all results require human review.
// Queries return only opaque IDs, counts and timestamps, never report notes,
// contact details, names, email addresses or content text.
func Definitions() []CheckDefinition {
	return []CheckDefinition{
		{
			Code: "REPORTER_BURST", Severity: "warning", Title: "حساب يرسل بلاغات كثيرة خلال يوم",
			Description: "حساب أرسل 8 بلاغات معلّقة على 5 أهداف مختلفة على الأقل خلال آخر 24 ساعة. قد يكون نمط إساءة استخدام أو نشاط مراجعة مشروع؛ يلزم فحص بشري.", EntityType: "reporter",
			Query: `SELECT r."userId" AS "id", COUNT(*)::bigint AS "reportCount",
				COUNT(DISTINCT (r."targetType", r."targetId"))::bigint AS "targetCount"
				FROM "reports" r
				WHERE r."status" = 'PENDING' AND r."createdAt" >= NOW() - INTERVAL '24 hours'
				GROUP BY r."userId"
				HAVING COUNT(*) >= 8 AND COUNT(DISTINCT (r."targetType", r."targetId")) >= 5`,
		},
		{
			Code: "REPORT_TARGET_BURST", Severity: "warning", Title: "تجمّع بلاغات سريع حول هدف واحد",
			Description: "خمسة مُبلّغين مختلفين على الأقل أرسلوا بلاغات معلّقة حول الهدف نفسه خلال فترة لا تتجاوز ساعتين من آخر 6 ساعات. هذا مؤشر مراجعة وليس دليلًا على التنسيق.", EntityType: "reported_target",
			Query: `WITH pending_reports AS MATERIALIZED (
					SELECT r."targetType", r."targetId", r."userId", r."createdAt"
					FROM "reports" r
					WHERE r."status" = 'PENDING' AND r."createdAt" >= NOW() - INTERVAL '6 hours'
				), candidate_windows AS (
					SELECT anchor."targetType", anchor."targetId",
						COUNT(DISTINCT window_report."userId")::bigint AS "reporterCount",
						MIN(window_report."createdAt") AS "firstReportAt",
						MAX(window_report."createdAt") AS "lastReportAt"
					FROM pending_reports anchor
					INNER JOIN pending_reports window_report
						ON window_report."targetType" = anchor."targetType"
						AND window_report."targetId" = anchor."targetId"
						AND window_report."createdAt" >= anchor."createdAt"
						AND window_report."createdAt" <= anchor."createdAt" + INTERVAL '2 hours'
					GROUP BY anchor."targetType", anchor."targetId", anchor."createdAt"
					HAVING COUNT(DISTINCT window_report."userId") >= 5
				), ranked_windows AS (
					SELECT *, ROW_NUMBER() OVER (
						PARTITION BY "targetType", "targetId"
						ORDER BY "reporterCount" DESC, "firstReportAt" ASC, "lastReportAt" ASC
					) AS "windowRank"
					FROM candidate_windows
				)
				SELECT "targetId" AS "id", "targetType"::text AS "targetType",
					"reporterCount", "firstReportAt", "lastReportAt"
				FROM ranked_windows WHERE "windowRank" = 1`,
		},
		{
			Code: "NEW_ACCOUNT_REPORT_BURST", Severity: "warning", Title: "حساب حديث يرسل عدة بلاغات",
			Description: "حساب أُنشئ خلال آخر 48 ساعة وأرسل 3 بلاغات معلّقة على أهداف مختلفة على الأقل خلال آخر 24 ساعة. حداثة الحساب وحدها لا تُعد مخالفة.", EntityType: "reporter",
			Query: `SELECT r."userId" AS "id", COUNT(*)::bigint AS "reportCount",
				COUNT(DISTINCT (r."targetType", r."targetId"))::bigint AS "targetCount",
				MIN(u."createdAt") AS "accountCreatedAt"
				FROM "reports" r
				INNER JOIN "users" u ON u."id" = r."userId"
				WHERE r."status" = 'PENDING'
				  AND r."createdAt" >= NOW() - INTERVAL '24 hours'
				  AND u."createdAt" >= NOW() - INTERVAL '48 hours'
				GROUP BY r."userId"
				HAVING COUNT(*) >= 3 AND COUNT(DISTINCT (r."targetType", r."targetId")) >= 3`,
		},
		{
			Code: "REPEATED_UNREVIEWED_FRAUD_SIGNALS", Severity: "warning", Title: "تكرار إشارات احتيال غير مراجعة لحساب",
			Description: "ست إشارات احتيال غير مراجعة أو أكثر مرتبطة بالحساب خلال آخر 24 ساعة. قد تنتج عدة إشارات من إعلان واحد؛ راجع التفاصيل قبل اتخاذ أي إجراء.", EntityType: "user",
			Query: `SELECT fs."userId" AS "id", COUNT(*)::bigint AS "signalCount",
				COUNT(DISTINCT fs."adId")::bigint AS "adCount",
				MIN(fs."createdAt") AS "firstSignalAt", MAX(fs."createdAt") AS "lastSignalAt"
				FROM "fraud_signals" fs
				WHERE fs."userId" IS NOT NULL AND fs."reviewed" = FALSE
				  AND fs."createdAt" >= NOW() - INTERVAL '24 hours'
				GROUP BY fs."userId"
				HAVING COUNT(*) >= 6`,
		},
	}
}

// Scan takes one consistent read-only snapshot. A transaction-scoped advisory
// lock prevents simultaneous full scans across API/worker instances without
// leaving a session lock behind if the request is cancelled.
func Scan(ctx context.Context, db *sql.DB) (Report, error) {
	if db == nil {
		return Report{}, errors.New("fraud monitor database is required")
	}
	if ctx == nil {
		return Report{}, errors.New("fraud monitor context is required")
	}

	scanCtx, cancel := context.WithTimeout(ctx, TransactionTimeout)
	defer cancel()
	started := time.Now()
	report := Report{
		Mode: "read_only", ScannedAt: started.UTC(),
		Checks: make([]CheckResult, 0, len(Definitions())),
	}

	tx, err := db.BeginTx(scanCtx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return Report{}, fmt.Errorf("begin read-only fraud monitor snapshot: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var locked bool
	if err := tx.QueryRowContext(scanCtx, `SELECT pg_try_advisory_xact_lock($1)`, AdvisoryLockID).Scan(&locked); err != nil {
		return Report{}, fmt.Errorf("acquire fraud monitor scan guard: %w", err)
	}
	if !locked {
		return Report{}, ErrAlreadyRunning
	}
	if _, err := tx.ExecContext(scanCtx, `SET LOCAL statement_timeout = '12s'`); err != nil {
		return Report{}, fmt.Errorf("set fraud monitor statement timeout: %w", err)
	}

	for _, definition := range Definitions() {
		result, err := executeCheck(scanCtx, tx, definition)
		if err != nil {
			return Report{}, fmt.Errorf("run fraud monitor check %s: %w", definition.Code, err)
		}
		report.Checks = append(report.Checks, result)
		report.FindingCount += result.Count
		switch result.Severity {
		case "critical":
			report.BySeverity.Critical += result.Count
		case "warning":
			report.BySeverity.Warning += result.Count
		case "info":
			report.BySeverity.Info += result.Count
		}
	}

	if err := tx.Commit(); err != nil {
		return Report{}, fmt.Errorf("commit fraud monitor read-only snapshot: %w", err)
	}
	report.CheckCount = len(report.Checks)
	report.DurationMillis = time.Since(started).Milliseconds()
	return report, nil
}

func executeCheck(ctx context.Context, tx *sql.Tx, definition CheckDefinition) (CheckResult, error) {
	query := fmt.Sprintf(`
		WITH findings AS MATERIALIZED (
			%s
		)
		SELECT COUNT(*)::bigint,
		       COALESCE((
				SELECT jsonb_agg(to_jsonb(sample_row))
				FROM (SELECT * FROM findings ORDER BY "id" ASC LIMIT $1) AS sample_row
		       ), '[]'::jsonb)
		FROM findings
	`, definition.Query)

	result := CheckResult{
		Code: definition.Code, Severity: definition.Severity, Title: definition.Title,
		Description: definition.Description, EntityType: definition.EntityType,
		Samples: make([]Sample, 0),
	}
	var samplesJSON []byte
	if err := tx.QueryRowContext(ctx, query, SampleLimit).Scan(&result.Count, &samplesJSON); err != nil {
		return result, err
	}
	if len(samplesJSON) > 0 {
		if err := json.Unmarshal(samplesJSON, &result.Samples); err != nil {
			return result, fmt.Errorf("decode bounded fraud samples: %w", err)
		}
	}
	if result.Samples == nil {
		result.Samples = make([]Sample, 0)
	}
	return result, nil
}
