package analyticssummary

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"marketplat/apps/go-worker/internal/analyticsrollup"
)

const MaxRange = 365 * 24 * time.Hour
const QueryTimeout = 6 * time.Second

var EventTypes = []string{
	"PAGE_VIEW", "AD_VIEW", "SEARCH", "CATEGORY_BROWSE", "CONTACT_CLICK",
	"SIGNUP_STARTED", "SIGNUP_COMPLETED", "PRODUCT_VIEW", "SERVICE_VIEW",
}

type Request struct {
	From   time.Time `json:"from"`
	To     time.Time `json:"to"`
	Bucket string    `json:"bucket"`
}

type TrendPoint struct {
	Bucket time.Time `json:"bucket"`
	Event  string    `json:"event"`
	Count  int64     `json:"count"`
}

type Category struct {
	CategoryID string  `json:"categoryId"`
	Count      int64   `json:"count"`
	Name       *string `json:"name"`
	NameAr     *string `json:"nameAr"`
}

type SearchToContactFunnel struct {
	SearchSessions  int64   `json:"searchSessions"`
	ContactSessions int64   `json:"contactSessions"`
	ConversionRate  float64 `json:"conversionRate"`
}

type SignupFunnel struct {
	StartedSessions   int64   `json:"startedSessions"`
	CompletedSessions int64   `json:"completedSessions"`
	ConversionRate    float64 `json:"conversionRate"`
}

type Range struct {
	From   time.Time `json:"from"`
	To     time.Time `json:"to"`
	Bucket string    `json:"bucket"`
}

type Summary struct {
	Range           Range                 `json:"range"`
	Totals          map[string]int64      `json:"totals"`
	Trend           []TrendPoint          `json:"trend"`
	TopCategories   []Category            `json:"topCategories"`
	SearchToContact SearchToContactFunnel `json:"searchToContact"`
	SignupFunnel    SignupFunnel          `json:"signupFunnel"`
}

func Validate(request Request) error {
	if request.From.IsZero() || request.To.IsZero() {
		return errors.New("from and to are required")
	}
	if request.From.After(request.To) {
		return errors.New("from must be before or equal to to")
	}
	if request.To.Sub(request.From) > MaxRange {
		return errors.New("date range must not exceed 365 days")
	}
	if request.Bucket != "day" && request.Bucket != "week" {
		return errors.New("bucket must be day or week")
	}
	return nil
}

func Get(ctx context.Context, db *sql.DB, request Request) (Summary, error) {
	if db == nil {
		return Summary{}, errors.New("analytics database is required")
	}
	if err := Validate(request); err != nil {
		return Summary{}, err
	}
	// Prisma Date values reach PostgreSQL as UTC instants. Normalize the
	// incoming RFC3339 timestamps to UTC before binding them to the existing
	// TIMESTAMP(3) columns so Go and Express apply identical range boundaries.
	from := request.From.UTC()
	to := request.To.UTC()
	queryCtx, cancel := context.WithTimeout(ctx, QueryTimeout)
	defer cancel()

	summary := Summary{
		Range:  Range{From: from, To: to, Bucket: request.Bucket},
		Totals: make(map[string]int64, len(EventTypes)),
		Trend:  []TrendPoint{}, TopCategories: []Category{},
	}
	for _, event := range EventTypes {
		summary.Totals[event] = 0
	}

	rollupsReady, err := areRollupsReady(queryCtx, db)
	if err != nil {
		return Summary{}, fmt.Errorf("check analytics rollup readiness: %w", err)
	}
	fullStart, fullEnd := analyticsrollup.FullDayRange(from, to)
	if rollupsReady && fullStart.Before(fullEnd) {
		if err := loadRolledTotals(queryCtx, db, &summary, from, to, fullStart, fullEnd); err != nil {
			return Summary{}, err
		}
		if err := loadRolledTrend(queryCtx, db, &summary, request.Bucket, from, to, fullStart, fullEnd); err != nil {
			return Summary{}, err
		}
		if err := loadRolledTopCategories(queryCtx, db, &summary, from, to, fullStart, fullEnd); err != nil {
			return Summary{}, err
		}
	} else {
		if err := loadRawTotals(queryCtx, db, &summary, from, to); err != nil {
			return Summary{}, err
		}
		if err := loadRawTrend(queryCtx, db, &summary, request.Bucket, from, to); err != nil {
			return Summary{}, err
		}
		if err := loadRawTopCategories(queryCtx, db, &summary, from, to); err != nil {
			return Summary{}, err
		}
	}

	var searchSessions, contactSessions, startedSessions, completedSessions int64
	err = db.QueryRowContext(queryCtx, `
		SELECT
			COUNT(DISTINCT "sessionId") FILTER (WHERE "event" = 'SEARCH'),
			COUNT(DISTINCT "sessionId") FILTER (WHERE "event" = 'CONTACT_CLICK'),
			COUNT(DISTINCT "sessionId") FILTER (WHERE "event" = 'SIGNUP_STARTED'),
			COUNT(DISTINCT "sessionId") FILTER (WHERE "event" = 'SIGNUP_COMPLETED')
		FROM "analytics_events"
		WHERE "createdAt" >= $1 AND "createdAt" < $2
		  AND "event" IN ('SEARCH', 'CONTACT_CLICK', 'SIGNUP_STARTED', 'SIGNUP_COMPLETED')
	`, from, to).Scan(&searchSessions, &contactSessions, &startedSessions, &completedSessions)
	if err != nil {
		return Summary{}, fmt.Errorf("query analytics funnel sessions: %w", err)
	}

	summary.SearchToContact = SearchToContactFunnel{
		SearchSessions: searchSessions, ContactSessions: contactSessions,
		ConversionRate: ratio(contactSessions, searchSessions),
	}
	summary.SignupFunnel = SignupFunnel{
		StartedSessions: startedSessions, CompletedSessions: completedSessions,
		ConversionRate: ratio(completedSessions, startedSessions),
	}
	return summary, nil
}

func areRollupsReady(ctx context.Context, db *sql.DB) (bool, error) {
	var ready bool
	err := db.QueryRowContext(ctx, `
		SELECT to_regclass('analytics_event_daily_rollups') IS NOT NULL
		   AND to_regclass('analytics_rollup_days') IS NOT NULL
	`).Scan(&ready)
	return ready, err
}

func loadRawTotals(ctx context.Context, db *sql.DB, summary *Summary, from, to time.Time) error {
	rows, err := db.QueryContext(ctx, `
		SELECT "event"::text, COUNT(*)::bigint
		FROM "analytics_events"
		WHERE "createdAt" >= $1 AND "createdAt" < $2
		GROUP BY "event"
	`, from, to)
	if err != nil {
		return fmt.Errorf("query analytics event totals: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var event string
		var count int64
		if err := rows.Scan(&event, &count); err != nil {
			return fmt.Errorf("scan analytics totals: %w", err)
		}
		if _, known := summary.Totals[event]; known && count >= 0 {
			summary.Totals[event] = count
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate analytics totals: %w", err)
	}
	return nil
}

func loadRawTrend(ctx context.Context, db *sql.DB, summary *Summary, bucket string, from, to time.Time) error {
	rows, err := db.QueryContext(ctx, `
		SELECT date_trunc($1, "createdAt") AS bucket, "event"::text, COUNT(*)::bigint
		FROM "analytics_events"
		WHERE "createdAt" >= $2 AND "createdAt" < $3
		GROUP BY 1, 2 ORDER BY 1 ASC
	`, bucket, from, to)
	if err != nil {
		return fmt.Errorf("query analytics trend: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var point TrendPoint
		if err := rows.Scan(&point.Bucket, &point.Event, &point.Count); err != nil {
			return fmt.Errorf("scan analytics trend: %w", err)
		}
		summary.Trend = append(summary.Trend, point)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate analytics trend: %w", err)
	}
	return nil
}

func loadRawTopCategories(ctx context.Context, db *sql.DB, summary *Summary, from, to time.Time) error {
	rows, err := db.QueryContext(ctx, `
		SELECT e.metadata->>'categoryId' AS "categoryId", COUNT(*)::bigint,
		       c."name", c."nameAr"
		FROM "analytics_events" e
		LEFT JOIN "categories" c ON c."id" = e.metadata->>'categoryId'
		WHERE e."event" = 'CATEGORY_BROWSE'
		  AND e."createdAt" >= $1 AND e."createdAt" < $2
		  AND e.metadata->>'categoryId' IS NOT NULL
		  AND e.metadata->>'categoryId' <> ''
		GROUP BY 1, 3, 4 ORDER BY COUNT(*) DESC LIMIT 20
	`, from, to)
	if err != nil {
		return fmt.Errorf("query top analytics categories: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var category Category
		if err := rows.Scan(&category.CategoryID, &category.Count, &category.Name, &category.NameAr); err != nil {
			return fmt.Errorf("scan top analytics category: %w", err)
		}
		summary.TopCategories = append(summary.TopCategories, category)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate top analytics categories: %w", err)
	}
	return nil
}

func loadRolledTotals(ctx context.Context, db *sql.DB, summary *Summary, from, to, fullStart, fullEnd time.Time) error {
	rows, err := db.QueryContext(ctx, `
		WITH counts AS (
			SELECT r."event"::text AS event, SUM(r."eventCount")::bigint AS count
			FROM "analytics_event_daily_rollups" r
			JOIN "analytics_rollup_days" d ON d."bucketDate" = r."bucketDate"
			WHERE r."bucketDate" >= $3::date AND r."bucketDate" < $4::date
			GROUP BY r."event"
			UNION ALL
			SELECT e."event"::text AS event, COUNT(*)::bigint AS count
			FROM "analytics_events" e
			WHERE e."createdAt" >= $1 AND e."createdAt" < $2
			  AND NOT EXISTS (
				SELECT 1 FROM "analytics_rollup_days" d
				WHERE d."bucketDate" = e."createdAt"::date
				  AND d."bucketDate" >= $3::date AND d."bucketDate" < $4::date
			  )
			GROUP BY e."event"
		)
		SELECT event, SUM(count)::bigint FROM counts GROUP BY event
	`, from, to, fullStart.Format("2006-01-02"), fullEnd.Format("2006-01-02"))
	if err != nil {
		return fmt.Errorf("query rolled analytics totals: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var event string
		var count int64
		if err := rows.Scan(&event, &count); err != nil {
			return fmt.Errorf("scan rolled analytics totals: %w", err)
		}
		if _, known := summary.Totals[event]; known && count >= 0 {
			summary.Totals[event] = count
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate rolled analytics totals: %w", err)
	}
	return nil
}

func loadRolledTrend(ctx context.Context, db *sql.DB, summary *Summary, bucket string, from, to, fullStart, fullEnd time.Time) error {
	rows, err := db.QueryContext(ctx, `
		WITH points AS (
			SELECT date_trunc($1, r."bucketDate"::timestamp) AS bucket,
			       r."event"::text AS event, SUM(r."eventCount")::bigint AS count
			FROM "analytics_event_daily_rollups" r
			JOIN "analytics_rollup_days" d ON d."bucketDate" = r."bucketDate"
			WHERE r."bucketDate" >= $4::date AND r."bucketDate" < $5::date
			GROUP BY 1, 2
			UNION ALL
			SELECT date_trunc($1, e."createdAt") AS bucket,
			       e."event"::text AS event, COUNT(*)::bigint AS count
			FROM "analytics_events" e
			WHERE e."createdAt" >= $2 AND e."createdAt" < $3
			  AND NOT EXISTS (
				SELECT 1 FROM "analytics_rollup_days" d
				WHERE d."bucketDate" = e."createdAt"::date
				  AND d."bucketDate" >= $4::date AND d."bucketDate" < $5::date
			  )
			GROUP BY 1, 2
		)
		SELECT bucket, event, SUM(count)::bigint
		FROM points GROUP BY bucket, event ORDER BY bucket ASC
	`, bucket, from, to, fullStart.Format("2006-01-02"), fullEnd.Format("2006-01-02"))
	if err != nil {
		return fmt.Errorf("query rolled analytics trend: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var point TrendPoint
		if err := rows.Scan(&point.Bucket, &point.Event, &point.Count); err != nil {
			return fmt.Errorf("scan rolled analytics trend: %w", err)
		}
		summary.Trend = append(summary.Trend, point)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate rolled analytics trend: %w", err)
	}
	return nil
}

func loadRolledTopCategories(ctx context.Context, db *sql.DB, summary *Summary, from, to, fullStart, fullEnd time.Time) error {
	rows, err := db.QueryContext(ctx, `
		WITH category_counts AS (
			SELECT r."categoryId" AS "categoryId", SUM(r."eventCount")::bigint AS count
			FROM "analytics_event_daily_rollups" r
			JOIN "analytics_rollup_days" d ON d."bucketDate" = r."bucketDate"
			WHERE r."event" = 'CATEGORY_BROWSE' AND r."categoryId" <> ''
			  AND r."bucketDate" >= $3::date AND r."bucketDate" < $4::date
			GROUP BY r."categoryId"
			UNION ALL
			SELECT e.metadata->>'categoryId' AS "categoryId", COUNT(*)::bigint AS count
			FROM "analytics_events" e
			WHERE e."event" = 'CATEGORY_BROWSE'
			  AND e."createdAt" >= $1 AND e."createdAt" < $2
			  AND e.metadata->>'categoryId' IS NOT NULL
			  AND NOT EXISTS (
				SELECT 1 FROM "analytics_rollup_days" d
				WHERE d."bucketDate" = e."createdAt"::date
				  AND d."bucketDate" >= $3::date AND d."bucketDate" < $4::date
			  )
			GROUP BY e.metadata->>'categoryId'
		), totals AS (
			SELECT "categoryId", SUM(count)::bigint AS count
			FROM category_counts GROUP BY "categoryId"
		)
		SELECT t."categoryId", t.count, c."name", c."nameAr"
		FROM totals t
		LEFT JOIN "categories" c ON c."id" = t."categoryId"
		ORDER BY t.count DESC LIMIT 20
	`, from, to, fullStart.Format("2006-01-02"), fullEnd.Format("2006-01-02"))
	if err != nil {
		return fmt.Errorf("query rolled top analytics categories: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var category Category
		if err := rows.Scan(&category.CategoryID, &category.Count, &category.Name, &category.NameAr); err != nil {
			return fmt.Errorf("scan rolled top analytics category: %w", err)
		}
		summary.TopCategories = append(summary.TopCategories, category)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("iterate rolled top analytics categories: %w", err)
	}
	return nil
}

func ratio(numerator, denominator int64) float64 {
	if denominator <= 0 {
		return 0
	}
	return float64(numerator) / float64(denominator)
}
