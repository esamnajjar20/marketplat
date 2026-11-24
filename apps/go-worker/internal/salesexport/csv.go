// Package salesexport streams seller-scoped sales reports as CSV.
// Express remains responsible for authenticating the seller and supplies the
// verified seller ID over the authenticated internal worker connection.
package salesexport

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const BatchSize = 5000

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

type Options struct {
	SellerID string
	StoreID  string
	Status   string
	From     *time.Time
	To       *time.Time
}

// ParseOptions validates the internal export query. User-facing validation is
// performed by Express too; this second boundary protects the worker itself.
func ParseOptions(values url.Values) (Options, error) {
	options := Options{
		SellerID: strings.TrimSpace(values.Get("userId")),
		StoreID:  strings.TrimSpace(values.Get("storeId")),
		Status:   strings.TrimSpace(values.Get("status")),
	}
	if options.SellerID == "" || len(options.SellerID) > 128 {
		return Options{}, fmt.Errorf("userId is required")
	}
	if len(options.StoreID) > 128 {
		return Options{}, fmt.Errorf("storeId is too long")
	}
	switch options.Status {
	case "", "PAID", "PARTIAL", "UNPAID", "OVERDUE":
	default:
		return Options{}, fmt.Errorf("invalid status")
	}
	if raw := strings.TrimSpace(values.Get("from")); raw != "" {
		parsed, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return Options{}, fmt.Errorf("from must be RFC3339")
		}
		options.From = &parsed
	}
	if raw := strings.TrimSpace(values.Get("to")); raw != "" {
		parsed, err := time.Parse(time.RFC3339Nano, raw)
		if err != nil {
			return Options{}, fmt.Errorf("to must be RFC3339")
		}
		options.To = &parsed
	}
	if options.From != nil && options.To != nil && options.To.Before(*options.From) {
		return Options{}, fmt.Errorf("to must not be before from")
	}
	return options, nil
}

// WriteCSV streams every seller-owned sale record in deterministic keyset pages.
// The database only holds one 5,000-row page at a time; the export is not capped
// at that page size. A (soldAt,id) cursor prevents duplicates or gaps when many
// records share the same timestamp.
func WriteCSV(ctx context.Context, db queryer, dst io.Writer, options Options) error {
	if options.SellerID == "" {
		return fmt.Errorf("seller ID is required")
	}

	baseArgs := []any{options.SellerID}
	conditions := []string{`sale."sellerId" = $1`}
	addCondition := func(expression string, value any) {
		baseArgs = append(baseArgs, value)
		conditions = append(conditions, fmt.Sprintf(expression, len(baseArgs)))
	}
	if options.StoreID != "" {
		addCondition(`sale."storeId" = $%d`, options.StoreID)
	}
	if options.Status != "" {
		addCondition(`sale."paymentStatus"::text = $%d`, options.Status)
	}
	if options.From != nil {
		addCondition(`sale."soldAt" >= $%d`, *options.From)
	}
	if options.To != nil {
		addCondition(`sale."soldAt" <= $%d`, *options.To)
	}

	if _, err := io.WriteString(dst, "\uFEFF"); err != nil {
		return err
	}
	wroteRow := false
	if err := writeRow(dst, &wroteRow, []string{
		"الفاتورة", "التاريخ", "العميل", "المتجر", "الوصف", "الكمية", "الإيراد", "التكلفة", "الربح", "المدفوع", "المتبقي", "المرتجع", "الحالة",
	}); err != nil {
		return err
	}

	var lastSoldAt time.Time
	var lastID string
	for {
		args := append([]any(nil), baseArgs...)
		pageConditions := append([]string(nil), conditions...)
		if lastID != "" {
			args = append(args, lastSoldAt, lastID)
			pageConditions = append(pageConditions, fmt.Sprintf(
				`(sale."soldAt", sale."id") < ($%d, $%d)`, len(args)-1, len(args),
			))
		}
		args = append(args, BatchSize)
		limitPlaceholder := len(args)
		query := `
			WITH selected_sales AS MATERIALIZED (
				SELECT sale.*
				FROM "sale_records" AS sale
				WHERE ` + strings.Join(pageConditions, " AND ") + `
				ORDER BY sale."soldAt" DESC, sale."id" DESC
				LIMIT $` + strconv.Itoa(limitPlaceholder) + `
			)
			SELECT
				sale."id",
				COALESCE(sale."invoiceNumber", ''),
				sale."soldAt",
				sale."buyerName",
				COALESCE(store."name", ''),
				sale."entityTitle",
				COALESCE(item_totals."quantity", 0),
				ROUND(sale."totalPrice" - sale."refundedAmount", 2)::text,
				COALESCE(item_totals."cost", 0)::numeric(30,2)::text,
				ROUND((sale."totalPrice" - sale."refundedAmount") - COALESCE(item_totals."cost", 0), 2)::text,
				sale."paidAmount"::numeric(12,2)::text,
				sale."dueAmount"::numeric(12,2)::text,
				sale."refundedAmount"::numeric(12,2)::text,
				sale."paymentStatus"::text
			FROM selected_sales AS sale
			LEFT JOIN "store_details" AS store ON store."id" = sale."storeId"
			LEFT JOIN LATERAL (
				SELECT
					COALESCE(SUM(GREATEST(item."quantity" - item."returnedQuantity", 0)), 0)::bigint AS "quantity",
					COALESCE(SUM(COALESCE(item."costPrice", 0) * GREATEST(item."quantity" - item."returnedQuantity", 0)), 0) AS "cost"
				FROM "sale_items" AS item
				WHERE item."saleId" = sale."id"
			) AS item_totals ON TRUE
			ORDER BY sale."soldAt" DESC, sale."id" DESC`

		rows, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			return err
		}
		pageCount := 0
		for rows.Next() {
			var id, invoice, buyer, store, title, revenue, cost, profit, paid, due, refunded, status string
			var soldAt time.Time
			var quantity int64
			if err := rows.Scan(&id, &invoice, &soldAt, &buyer, &store, &title, &quantity,
				&revenue, &cost, &profit, &paid, &due, &refunded, &status); err != nil {
				rows.Close()
				return err
			}
			values := []string{
				invoice,
				soldAt.UTC().Format("2006-01-02T15:04:05.000Z"),
				buyer,
				store,
				title,
				strconv.FormatInt(quantity, 10),
				revenue,
				cost,
				profit,
				paid,
				due,
				refunded,
				status,
			}
			if err := writeRow(dst, &wroteRow, values); err != nil {
				rows.Close()
				return err
			}
			lastSoldAt = soldAt
			lastID = id
			pageCount++
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return rowsErr
		}
		if closeErr != nil {
			return closeErr
		}
		if pageCount < BatchSize {
			return nil
		}
	}
}

func writeRow(dst io.Writer, wroteRow *bool, values []string) error {
	if *wroteRow {
		if _, err := io.WriteString(dst, "\n"); err != nil {
			return err
		}
	}
	for index, value := range values {
		if index > 0 {
			if _, err := io.WriteString(dst, ","); err != nil {
				return err
			}
		}
		if _, err := io.WriteString(dst, escapeCell(value)); err != nil {
			return err
		}
	}
	*wroteRow = true
	return nil
}

func escapeCell(value string) string {
	if value != "" {
		switch value[0] {
		case '=', '+', '@', '\t', '\r':
			value = "'" + value
		case '-':
			// Preserve ordinary negative numeric cells (e.g. a loss) while
			// neutralizing text that could be interpreted as a formula.
			if !isNegativeNumericCell(value) {
				value = "'" + value
			}
		}
	}
	if strings.ContainsAny(value, ",\"\n\r") {
		return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
	}
	return value
}

func isNegativeNumericCell(value string) bool {
	if len(value) < 2 || value[0] != '-' {
		return false
	}
	dotSeen := false
	digitSeen := false
	for _, char := range value[1:] {
		if char == '.' {
			if dotSeen {
				return false
			}
			dotSeen = true
			continue
		}
		if char < '0' || char > '9' {
			return false
		}
		digitSeen = true
	}
	return digitSeen
}
