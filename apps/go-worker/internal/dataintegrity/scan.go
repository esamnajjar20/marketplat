// Package dataintegrity performs bounded, read-only consistency checks across
// marketplace tables. It never mutates domain rows; repair decisions remain
// explicit human actions until a rule has a separately proven safe repair.
package dataintegrity

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"
)

const (
	SampleLimit        = 10
	StatementTimeout   = "12s"
	TransactionTimeout = 18 * time.Second
)

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

// Definitions returns the fixed, reviewable SQL checks. Queries select only
// opaque entity IDs and diagnostic fields; no names, email addresses, phones,
// addresses, tokens, or free-form user content are returned to the admin UI.
func Definitions() []CheckDefinition {
	return []CheckDefinition{
		{
			Code: "AD_ACTIVE_AFTER_EXPIRY", Severity: "warning", Title: "إعلان نشط بعد انتهاء صلاحيته",
			Description: "إعلان ما زال ACTIVE رغم أن expiresAt مرّ. افحص تشغيل مهمة انتهاء الإعلانات وتأثيرها في الكاش.", EntityType: "ad",
			Query: `SELECT "id", "status", "expiresAt" FROM "ads" WHERE "status" = 'ACTIVE' AND "expiresAt" IS NOT NULL AND "expiresAt" <= NOW()`,
		},
		{
			Code: "OPEN_REQUEST_AFTER_EXPIRY", Severity: "warning", Title: "طلب مفتوح بعد موعد انتهائه",
			Description: "طلب OPEN تجاوز expiresAt ولم تنتقل حالته إلى EXPIRED.", EntityType: "request",
			Query: `SELECT "id", "status", "expiresAt" FROM "requests" WHERE "status" = 'OPEN' AND "expiresAt" IS NOT NULL AND "expiresAt" <= NOW()`,
		},
		{
			Code: "PROMOTION_STATUS_DRIFT", Severity: "warning", Title: "حالة عرض لا تطابق نافذته الزمنية",
			Description: "الحالة المخزنة لا تطابق startsAt/endsAt أو حد الاستخدام. حالة DRAFT وCANCELLED مستثناة عمدًا.", EntityType: "promotion",
			Query: `SELECT "id", "status", "startsAt", "endsAt", "usageCount", "maxUses" FROM "promotions" WHERE "status" NOT IN ('DRAFT', 'CANCELLED') AND (("maxUses" IS NOT NULL AND "usageCount" >= "maxUses" AND "status" <> 'EXPIRED') OR ("status" = 'SCHEDULED' AND ("startsAt" <= NOW() OR "endsAt" <= NOW())) OR ("status" = 'ACTIVE' AND ("startsAt" > NOW() OR "endsAt" <= NOW())) OR ("status" = 'EXPIRED' AND "endsAt" > NOW() AND ("maxUses" IS NULL OR "usageCount" < "maxUses")))`,
		},
		{
			Code: "PROMOTION_STORE_PRODUCT_MISMATCH", Severity: "critical", Title: "العرض مرتبط بمنتج من متجر آخر",
			Description: "storeId في Promotion لا يطابق storeId للمنتج المرتبط. لا يتم تعديل أي سجل تلقائيًا.", EntityType: "promotion",
			Query: `SELECT p."id", p."storeId", p."productId", product."storeId" AS "productStoreId" FROM "promotions" p INNER JOIN "products" product ON product."id" = p."productId" WHERE p."storeId" <> product."storeId"`,
		},
		{
			Code: "PRODUCT_NEGATIVE_STOCK", Severity: "critical", Title: "كمية مخزون سالبة",
			Description: "stockQuantity أقل من صفر، وهو خارج قواعد التحقق وعمليات المخزون الحالية.", EntityType: "product",
			Query: `SELECT "id", "stockQuantity", "availability" FROM "products" WHERE "stockQuantity" < 0`,
		},
		{
			Code: "PRODUCT_ZERO_STOCK_AVAILABLE", Severity: "warning", Title: "منتج متاح رغم أن مخزونه صفر",
			Description: "منتج ACTIVE بكمية صفر لا يزال معلّمًا IN_STOCK أو LIMITED؛ المنتجات الموقوفة/المحذوفة مستثناة.", EntityType: "product",
			Query: `SELECT "id", "status", "stockQuantity", "availability" FROM "products" WHERE "status" = 'ACTIVE' AND "stockQuantity" = 0 AND "availability" <> 'OUT_OF_STOCK'`,
		},
		{
			Code: "STOCK_MOVEMENT_DELTA_MISMATCH", Severity: "critical", Title: "اختلاف في حساب حركة المخزون",
			Description: "عندما تكون الكميتان القديمة والجديدة والفرق معروفة، يجب أن يساوي delta الفرق بينهما. الحركات الابتدائية غير مشمولة.", EntityType: "stock_movement",
			Query: `SELECT "id", "productId", "previousQuantity", "newQuantity", "delta", "reason" FROM "stock_movements" WHERE "previousQuantity" IS NOT NULL AND "newQuantity" IS NOT NULL AND "delta" IS NOT NULL AND ("newQuantity" - "previousQuantity") <> "delta"`,
		},
		{
			Code: "ORDER_MISSING_STATUS_TIMESTAMP", Severity: "warning", Title: "طلب شراء بلا طابع زمني للحالة",
			Description: "مرحلة الطلب الحالية تتطلب وقت التأكيد أو الشحن أو التسليم أو الإلغاء وفق انتقالات MarketplaceOrder.", EntityType: "marketplace_order",
			Query: `SELECT "id", "status", "confirmedAt", "shippedAt", "deliveredAt", "cancelledAt" FROM "marketplace_orders" WHERE ("status" IN ('CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED') AND "confirmedAt" IS NULL) OR ("status" IN ('SHIPPED', 'DELIVERED') AND "shippedAt" IS NULL) OR ("status" = 'DELIVERED' AND "deliveredAt" IS NULL) OR ("status" = 'CANCELLED' AND "cancelledAt" IS NULL)`,
		},
		{
			Code: "ORDER_STORE_SELLER_MISMATCH", Severity: "critical", Title: "بائع الطلب لا يطابق مالك المتجر",
			Description: "sellerId في طلب السوق لا يطابق المستخدم المرتبط بملف مالك المتجر.", EntityType: "marketplace_order",
			Query: `SELECT o."id", o."sellerId", o."storeId", sp."userId" AS "storeOwnerUserId" FROM "marketplace_orders" o INNER JOIN "store_details" store ON store."id" = o."storeId" INNER JOIN "seller_profiles" sp ON sp."id" = store."sellerProfileId" WHERE o."sellerId" <> sp."userId"`,
		},
		{
			Code: "ORDER_ITEM_STORE_MISMATCH", Severity: "critical", Title: "عنصر طلب من متجر مختلف",
			Description: "منتج مرتبط بعنصر طلب يعود حاليًا إلى متجر غير المتجر المسجل على الطلب. العناصر المحذوفة ذات productId الفارغ مستثناة.", EntityType: "marketplace_order_item",
			Query: `SELECT item."id", item."orderId", item."productId", order_row."storeId" AS "orderStoreId", product."storeId" AS "productStoreId" FROM "marketplace_order_items" item INNER JOIN "marketplace_orders" order_row ON order_row."id" = item."orderId" INNER JOIN "products" product ON product."id" = item."productId" WHERE item."productId" IS NOT NULL AND product."storeId" <> order_row."storeId"`,
		},
		{
			Code: "ACCEPTED_REQUEST_OFFER_MISMATCH", Severity: "critical", Title: "العرض المقبول لا يتطابق مع الطلب",
			Description: "طلب ACCEPTED يجب أن يشير إلى عرض ACCEPTED تابع له، وأي طلب غير مقبول يجب ألا يحتفظ acceptedOfferId.", EntityType: "request",
			Query: `SELECT r."id", r."status", r."acceptedOfferId", offer."requestId" AS "offerRequestId", offer."status" AS "offerStatus" FROM "requests" r LEFT JOIN "request_offers" offer ON offer."id" = r."acceptedOfferId" WHERE (r."status" = 'ACCEPTED' AND (r."acceptedOfferId" IS NULL OR offer."id" IS NULL OR offer."requestId" <> r."id" OR offer."status" <> 'ACCEPTED')) OR (r."status" <> 'ACCEPTED' AND r."acceptedOfferId" IS NOT NULL)`,
		},
		{
			Code: "PUSH_DISPATCH_USER_MISMATCH", Severity: "critical", Title: "مستلم Push لا يطابق صاحب الإشعار",
			Description: "userId في سجل الإرسال الدائم يجب أن يطابق userId في الإشعار المرتبط.", EntityType: "notification_push_dispatch",
			Query: `SELECT dispatch."id", dispatch."notificationId", dispatch."userId" AS "dispatchUserId", notification."userId" AS "notificationUserId" FROM "notification_push_dispatches" dispatch INNER JOIN "notifications" notification ON notification."id" = dispatch."notificationId" WHERE dispatch."userId" <> notification."userId"`,
		},
		{
			Code: "APPOINTMENT_INVALID_TIME_RANGE", Severity: "warning", Title: "موعد بنطاق زمني غير صحيح",
			Description: "scheduledEnd يجب أن يكون بعد scheduledStart.", EntityType: "appointment",
			Query: `SELECT "id", "providerId", "requestId", "scheduledStart", "scheduledEnd", "status" FROM "appointments" WHERE "scheduledEnd" <= "scheduledStart"`,
		},
	}
}

func Scan(ctx context.Context, db *sql.DB) (Report, error) {
	if db == nil {
		return Report{}, errors.New("data integrity scanner database is required")
	}
	if ctx == nil {
		return Report{}, errors.New("data integrity scanner context is required")
	}

	scanCtx, cancel := context.WithTimeout(ctx, TransactionTimeout)
	defer cancel()

	started := time.Now()
	report := Report{
		Mode:      "read_only",
		ScannedAt: started.UTC(),
		Checks:    make([]CheckResult, 0, len(Definitions())),
	}

	tx, err := db.BeginTx(scanCtx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return Report{}, fmt.Errorf("begin read-only integrity snapshot: %w", err)
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.ExecContext(scanCtx, `SET LOCAL statement_timeout = '12s'`); err != nil {
		return Report{}, fmt.Errorf("set integrity scan statement timeout: %w", err)
	}

	for _, definition := range Definitions() {
		result, err := executeCheck(scanCtx, tx, definition)
		if err != nil {
			return Report{}, fmt.Errorf("run integrity check %s: %w", definition.Code, err)
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
		return Report{}, fmt.Errorf("commit read-only integrity snapshot: %w", err)
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
			return result, fmt.Errorf("decode bounded samples: %w", err)
		}
	}
	if result.Samples == nil {
		result.Samples = make([]Sample, 0)
	}
	return result, nil
}
