package weeklyreports

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"
)

type Kind string

const (
	Ads      Kind = "ads"
	Stores   Kind = "stores"
	Services Kind = "services"
)

type Result struct {
	Kind                 Kind   `json:"kind"`
	NotificationsCreated int64  `json:"notificationsCreated"`
	BaselinesAdvanced    int64  `json:"baselinesAdvanced"`
	OwnersConsidered     int64  `json:"ownersConsidered"`
	RunKey               string `json:"runKey"`
}

type delta struct {
	userID       string
	totalDelta   int64
	itemCount    int64
	entityIDs    []string
	viewSnapshot []int64
	entityID     string
}

type config struct {
	typeName     string
	title        string
	bodySingular string
	bodyPlural   string
	url          string
	tag          string
}

func configFor(kind Kind) (config, error) {
	switch kind {
	case Ads:
		return config{
			typeName: "WEEKLY_AD_VIEWS_REPORT", title: "تقرير مشاهدات إعلاناتك الأسبوعي",
			bodySingular: "حصل إعلانك على مشاهدة جديدة هذا الأسبوع",
			bodyPlural:   "حصلت إعلاناتك على %d مشاهدة جديدة هذا الأسبوع",
			url:          "/dashboard", tag: "weekly-ad-views-report",
		}, nil
	case Stores:
		return config{
			typeName: "WEEKLY_STORE_VIEWS_REPORT", title: "تقرير مشاهدات متجرك الأسبوعي",
			bodySingular: "حصل متجرك على مشاهدة جديدة هذا الأسبوع",
			bodyPlural:   "حصل متجرك على %d مشاهدة جديدة هذا الأسبوع",
			url:          "/my-store?tab=analytics", tag: "weekly-store-views-report",
		}, nil
	case Services:
		return config{
			typeName: "WEEKLY_SERVICE_VIEWS_REPORT", title: "تقرير مشاهدات خدماتك الأسبوعي",
			bodySingular: "حصلت خدماتك على مشاهدة جديدة هذا الأسبوع",
			bodyPlural:   "حصلت خدماتك على %d مشاهدة جديدة هذا الأسبوع",
			url:          "/my-services?tab=analytics", tag: "weekly-service-views-report",
		}, nil
	default:
		return config{}, fmt.Errorf("unsupported weekly report kind %q", kind)
	}
}

func Run(ctx context.Context, conn *sql.Conn, kind Kind, now time.Time) (Result, error) {
	cfg, err := configFor(kind)
	if err != nil {
		return Result{}, err
	}
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, fmt.Errorf("begin weekly %s report: %w", kind, err)
	}
	defer tx.Rollback()

	rows, err := loadDeltas(ctx, tx, kind)
	if err != nil {
		return Result{}, err
	}
	result := Result{Kind: kind, OwnersConsidered: int64(len(rows)), RunKey: now.UTC().Format("2006-01-02")}
	for _, row := range rows {
		if row.totalDelta <= 0 || len(row.entityIDs) == 0 || len(row.entityIDs) != len(row.viewSnapshot) {
			continue
		}
		body := cfg.bodySingular
		if row.totalDelta != 1 {
			body = fmt.Sprintf(cfg.bodyPlural, row.totalDelta)
		}
		id, err := newID()
		if err != nil {
			return result, err
		}
		// Preserve the existing notification data contract for each report type.
		var data []byte
		if kind == Ads {
			data, err = json.Marshal(map[string]any{"totalDelta": row.totalDelta, "adCount": row.itemCount})
		} else if kind == Stores {
			data, err = json.Marshal(map[string]any{"totalDelta": row.totalDelta, "storeId": row.entityID})
		} else {
			data, err = json.Marshal(map[string]any{"totalDelta": row.totalDelta, "providerId": row.entityID})
		}
		if err != nil {
			return result, err
		}
		idempotencyKey := fmt.Sprintf("marketplat:weekly-%s-views:%s:%s", kind, result.RunKey, row.userID)
		inserted, err := tx.ExecContext(ctx, `
			INSERT INTO "notifications"
				("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
			VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, NOW())
			ON CONFLICT ("idempotencyKey") DO NOTHING`,
			id, idempotencyKey, row.userID, cfg.typeName, cfg.title, body, string(data))
		if err != nil {
			return result, fmt.Errorf("insert %s notification: %w", kind, err)
		}
		count, err := inserted.RowsAffected()
		if err != nil {
			return result, err
		}
		if count == 0 {
			// The notification and baseline advancement commit together. A key
			// collision therefore means a prior run already advanced the baseline.
			continue
		}

		payload, err := json.Marshal(map[string]any{
			"title": cfg.title, "body": body, "url": cfg.url, "tag": cfg.tag, "type": cfg.typeName,
		})
		if err != nil {
			return result, err
		}
		dispatchID, err := newID()
		if err != nil {
			return result, err
		}
		_, err = tx.ExecContext(ctx, `
			INSERT INTO "notification_push_dispatches"
				("id", "notificationId", "userId", "payload", "idempotencyKey")
			VALUES ($1, $2, $3, $4::jsonb, $5)
			ON CONFLICT ("idempotencyKey") DO NOTHING`,
			dispatchID, id, row.userID, string(payload), "push:"+id)
		if err != nil {
			return result, fmt.Errorf("enqueue %s push dispatch: %w", kind, err)
		}

		advanced, err := updateBaselines(ctx, tx, kind, row.entityIDs, row.viewSnapshot)
		if err != nil {
			return result, err
		}
		result.NotificationsCreated += 1
		result.BaselinesAdvanced += advanced
	}
	if err := tx.Commit(); err != nil {
		return result, fmt.Errorf("commit weekly %s report: %w", kind, err)
	}
	return result, nil
}

func loadDeltas(ctx context.Context, tx *sql.Tx, kind Kind) ([]delta, error) {
	var query string
	switch kind {
	case Ads:
		query = `SELECT a."userId", SUM(a."views" - a."viewsAtLastReport")::bigint,
			COUNT(*)::bigint, ARRAY_AGG(a."id" ORDER BY a."id"), ARRAY_AGG(a."views"::bigint ORDER BY a."id"), ''
			FROM "ads" a INNER JOIN "users" u ON u."id" = a."userId"
			WHERE a."status" = 'ACTIVE' AND a."views" > a."viewsAtLastReport"
			AND COALESCE((u."notificationPreferences" ->> 'adViews')::boolean, FALSE) = TRUE
			GROUP BY a."userId" HAVING SUM(a."views" - a."viewsAtLastReport") > 0`
	case Stores:
		query = `SELECT sp."userId", (s."views" - s."viewsAtLastReport")::bigint, 1::bigint,
			ARRAY[s."id"], ARRAY[s."views"::bigint], s."id"
			FROM "store_details" s
			INNER JOIN "seller_profiles" sp ON sp."id" = s."sellerProfileId"
			INNER JOIN "users" u ON u."id" = sp."userId"
			WHERE s."status" = 'ACTIVE' AND s."views" > s."viewsAtLastReport"
			AND COALESCE((u."notificationPreferences" ->> 'adViews')::boolean, FALSE) = TRUE`
	case Services:
		query = `SELECT u."id", SUM(sl."views" - sl."viewsAtLastReport")::bigint,
			COUNT(*)::bigint, ARRAY_AGG(sl."id" ORDER BY sl."id"), ARRAY_AGG(sl."views"::bigint ORDER BY sl."id"), spd."id"
			FROM "service_listings" sl
			INNER JOIN "service_provider_details" spd ON spd."id" = sl."providerId"
			INNER JOIN "seller_profiles" sp ON sp."id" = spd."sellerProfileId"
			INNER JOIN "users" u ON u."id" = sp."userId"
			WHERE sl."status" = 'ACTIVE' AND sl."views" > sl."viewsAtLastReport"
			AND COALESCE((u."notificationPreferences" ->> 'adViews')::boolean, FALSE) = TRUE
			GROUP BY u."id", spd."id" HAVING SUM(sl."views" - sl."viewsAtLastReport") > 0`
	default:
		return nil, fmt.Errorf("unsupported weekly report kind %q", kind)
	}
	rows, err := tx.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("query weekly %s deltas: %w", kind, err)
	}
	defer rows.Close()
	out := make([]delta, 0)
	for rows.Next() {
		var item delta
		if err := rows.Scan(&item.userID, &item.totalDelta, &item.itemCount, &item.entityIDs, &item.viewSnapshot, &item.entityID); err != nil {
			return nil, fmt.Errorf("scan weekly %s delta: %w", kind, err)
		}
		out = append(out, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func updateBaselines(ctx context.Context, tx *sql.Tx, kind Kind, ids []string, snapshots []int64) (int64, error) {
	var query string
	switch kind {
	case Ads:
		query = `UPDATE "ads" AS target SET "viewsAtLastReport" = source.snapshot
			FROM unnest($1::text[], $2::bigint[]) AS source(id, snapshot)
			WHERE target."id" = source.id AND target."viewsAtLastReport" < source.snapshot`
	case Stores:
		query = `UPDATE "store_details" AS target SET "viewsAtLastReport" = source.snapshot
			FROM unnest($1::text[], $2::bigint[]) AS source(id, snapshot)
			WHERE target."id" = source.id AND target."viewsAtLastReport" < source.snapshot`
	case Services:
		query = `UPDATE "service_listings" AS target SET "viewsAtLastReport" = source.snapshot
			FROM unnest($1::text[], $2::bigint[]) AS source(id, snapshot)
			WHERE target."id" = source.id AND target."viewsAtLastReport" < source.snapshot`
	default:
		return 0, fmt.Errorf("unsupported weekly report kind %q", kind)
	}
	res, err := tx.ExecContext(ctx, query, ids, snapshots)
	if err != nil {
		return 0, fmt.Errorf("advance weekly %s baselines: %w", kind, err)
	}
	count, err := res.RowsAffected()
	return count, err
}

func newID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "go_" + hex.EncodeToString(b), nil
}

func BodyForTest(kind Kind, delta int64) (string, error) {
	cfg, err := configFor(kind)
	if err != nil {
		return "", err
	}
	if delta == 1 {
		return cfg.bodySingular, nil
	}
	return fmt.Sprintf(cfg.bodyPlural, delta), nil
}
