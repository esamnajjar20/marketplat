// Package salesinsights computes seller-facing smart insights in PostgreSQL
// so Express does not load thousands of sale items into Node.js memory.
package salesinsights

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"time"
)

type queryRower interface {
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

type Product struct {
	Title    string  `json:"title"`
	Revenue  float64 `json:"revenue"`
	Cost     float64 `json:"cost"`
	Quantity int64   `json:"quantity"`
	Profit   float64 `json:"profit"`
	Margin   float64 `json:"margin"`
}

type Insight struct {
	ID       string  `json:"id"`
	Severity string  `json:"severity"`
	Category string  `json:"category"`
	Title    string  `json:"title"`
	Body     string  `json:"body"`
	Metric   float64 `json:"metric"`
	Unit     string  `json:"unit"`
}

type Result struct {
	GeneratedAt string `json:"generatedAt"`
	PeriodDays  int    `json:"periodDays"`
	KPIs        struct {
		Revenue          float64 `json:"revenue"`
		PreviousRevenue  float64 `json:"previousRevenue"`
		RevenueChange    float64 `json:"revenueChange"`
		Orders           int64   `json:"orders"`
		AverageTicket    float64 `json:"averageTicket"`
		OverdueAmount    float64 `json:"overdueAmount"`
		LowStockProducts int64   `json:"lowStockProducts"`
	} `json:"kpis"`
	Forecast struct {
		Next30DaysRevenue float64 `json:"next30DaysRevenue"`
		Method            string  `json:"method"`
	} `json:"forecast"`
	TopProducts []Product `json:"topProducts"`
	Insights    []Insight `json:"insights"`
}

type metrics struct {
	currentCount     int64
	currentTotal     float64
	currentRefunded  float64
	previousCount    int64
	previousTotal    float64
	previousRefunded float64
	recent7Total     float64
	recent7Refunded  float64
	prior7Total      float64
	prior7Refunded   float64
	customerCount    int64
	customerAverage  sql.NullFloat64
	lowStock         int64
	overdueAmount    float64
	overdueCount     int64
	productsJSON     []byte
}

// Run executes one aggregate statement. The seller ID is supplied only by the
// authenticated Express API over the private token-protected worker channel.
func Run(ctx context.Context, db queryRower, sellerID string, now time.Time) (Result, error) {
	if sellerID == "" {
		return Result{}, fmt.Errorf("seller ID is required")
	}

	start30 := now.Add(-30 * 24 * time.Hour)
	start60 := now.Add(-60 * 24 * time.Hour)
	start7 := now.Add(-7 * 24 * time.Hour)
	start14 := now.Add(-14 * 24 * time.Hour)

	const query = `
		WITH period_metrics AS (
			SELECT
				COUNT(*) FILTER (WHERE sr."soldAt" >= $3)::bigint AS current_count,
				COALESCE(SUM(sr."totalPrice") FILTER (WHERE sr."soldAt" >= $3), 0)::double precision AS current_total,
				COALESCE(SUM(sr."refundedAmount") FILTER (WHERE sr."soldAt" >= $3), 0)::double precision AS current_refunded,
				COUNT(*) FILTER (WHERE sr."soldAt" >= $4 AND sr."soldAt" < $3)::bigint AS previous_count,
				COALESCE(SUM(sr."totalPrice") FILTER (WHERE sr."soldAt" >= $4 AND sr."soldAt" < $3), 0)::double precision AS previous_total,
				COALESCE(SUM(sr."refundedAmount") FILTER (WHERE sr."soldAt" >= $4 AND sr."soldAt" < $3), 0)::double precision AS previous_refunded,
				COALESCE(SUM(sr."totalPrice") FILTER (WHERE sr."soldAt" >= $5), 0)::double precision AS recent7_total,
				COALESCE(SUM(sr."refundedAmount") FILTER (WHERE sr."soldAt" >= $5), 0)::double precision AS recent7_refunded,
				COALESCE(SUM(sr."totalPrice") FILTER (WHERE sr."soldAt" >= $6 AND sr."soldAt" < $5), 0)::double precision AS prior7_total,
				COALESCE(SUM(sr."refundedAmount") FILTER (WHERE sr."soldAt" >= $6 AND sr."soldAt" < $5), 0)::double precision AS prior7_refunded
			FROM "sale_records" AS sr
			WHERE sr."sellerId" = $1 AND sr."soldAt" >= $4
		),
		customer_metrics AS (
			SELECT COUNT(*)::bigint AS customer_count,
				AVG(c."totalSpent")::double precision AS customer_average
			FROM "sales_customers" AS c
			WHERE c."sellerId" = $1
		),
		low_stock_metrics AS (
			SELECT COUNT(*)::bigint AS low_stock
			FROM "products" AS p
			INNER JOIN "store_details" AS st ON st."id" = p."storeId"
			INNER JOIN "seller_profiles" AS sp ON sp."id" = st."sellerProfileId"
			WHERE sp."userId" = $1
				AND p."status"::text <> 'DELETED'
				AND p."stockQuantity" <= 5
		),
		overdue_metrics AS (
			SELECT
				COALESCE(SUM(sr."dueAmount"), 0)::double precision AS overdue_amount,
				COUNT(*)::bigint AS overdue_count
			FROM "sale_records" AS sr
			WHERE sr."sellerId" = $1 AND sr."dueAmount" > 0 AND sr."dueDate" < $2
		),
		recent_items AS MATERIALIZED (
			SELECT si."id", si."productId", si."title", si."lineTotal",
				si."costPrice", si."quantity", si."returnedQuantity", si."createdAt"
			FROM "sale_items" AS si
			INNER JOIN "sale_records" AS sr ON sr."id" = si."saleId"
			WHERE sr."sellerId" = $1 AND sr."soldAt" >= $3
			ORDER BY si."createdAt" ASC, si."id" ASC
			LIMIT 5000
		),
		product_totals AS (
			SELECT
				(ARRAY_AGG(si."title" ORDER BY si."createdAt" ASC, si."id" ASC))[1] AS title,
				SUM(si."lineTotal")::double precision AS revenue,
				SUM(COALESCE(si."costPrice", 0) * GREATEST(si."quantity" - si."returnedQuantity", 0))::double precision AS cost,
				SUM(GREATEST(si."quantity" - si."returnedQuantity", 0))::bigint AS quantity,
				MIN(si."createdAt") AS first_created_at,
				(ARRAY_AGG(si."id" ORDER BY si."createdAt" ASC, si."id" ASC))[1] AS first_id
			FROM recent_items AS si
			GROUP BY si."productId", CASE WHEN si."productId" IS NULL THEN si."title" ELSE NULL END
			ORDER BY SUM(si."lineTotal") DESC, first_created_at ASC, first_id ASC
			LIMIT 10
		),
		product_json AS (
			SELECT COALESCE(
				jsonb_agg(jsonb_build_object(
					'title', pt.title,
					'revenue', pt.revenue,
					'cost', pt.cost,
					'quantity', pt.quantity
				) ORDER BY pt.revenue DESC, pt.first_created_at ASC, pt.first_id ASC),
				'[]'::jsonb
			)::text AS products
			FROM product_totals AS pt
		)
		SELECT
			pm.current_count,
			pm.current_total,
			pm.current_refunded,
			pm.previous_count,
			pm.previous_total,
			pm.previous_refunded,
			pm.recent7_total,
			pm.recent7_refunded,
			pm.prior7_total,
			pm.prior7_refunded,
			cm.customer_count,
			cm.customer_average,
			ls.low_stock,
			om.overdue_amount,
			om.overdue_count,
			pj.products
		FROM period_metrics AS pm
		CROSS JOIN customer_metrics AS cm
		CROSS JOIN low_stock_metrics AS ls
		CROSS JOIN overdue_metrics AS om
		CROSS JOIN product_json AS pj
	`

	var data metrics
	if err := db.QueryRowContext(ctx, query, sellerID, now, start30, start60, start7, start14).Scan(
		&data.currentCount,
		&data.currentTotal,
		&data.currentRefunded,
		&data.previousCount,
		&data.previousTotal,
		&data.previousRefunded,
		&data.recent7Total,
		&data.recent7Refunded,
		&data.prior7Total,
		&data.prior7Refunded,
		&data.customerCount,
		&data.customerAverage,
		&data.lowStock,
		&data.overdueAmount,
		&data.overdueCount,
		&data.productsJSON,
	); err != nil {
		return Result{}, err
	}

	var products []Product
	if err := json.Unmarshal(data.productsJSON, &products); err != nil {
		return Result{}, fmt.Errorf("decode top products: %w", err)
	}
	if products == nil {
		products = []Product{}
	}
	for index := range products {
		products[index].Profit = round(products[index].Revenue - products[index].Cost)
		if products[index].Revenue != 0 {
			products[index].Margin = round((products[index].Revenue - products[index].Cost) / products[index].Revenue * 100)
		}
	}
	return buildResult(now, data, products), nil
}

func buildResult(now time.Time, data metrics, products []Product) Result {
	revenue := round(data.currentTotal - data.currentRefunded)
	previousRevenue := round(data.previousTotal - data.previousRefunded)
	revenueChange := percentageChange(revenue, previousRevenue)
	recent7Revenue := round(data.recent7Total - data.recent7Refunded)
	prior7Revenue := round(data.prior7Total - data.prior7Refunded)
	weeklyChange := percentageChange(recent7Revenue, prior7Revenue)

	averageTicket := float64(0)
	if data.currentCount > 0 {
		averageTicket = round(revenue / float64(data.currentCount))
	}
	dailyForecast := revenue / 30
	forecast30 := round(dailyForecast * 30 * (1 + math.Max(-0.5, math.Min(0.5, weeklyChange/100))))

	result := Result{
		GeneratedAt: now.UTC().Format("2006-01-02T15:04:05.000Z"),
		PeriodDays:  30,
		TopProducts: products,
		Insights:    make([]Insight, 0, 6),
	}
	result.KPIs.Revenue = revenue
	result.KPIs.PreviousRevenue = previousRevenue
	result.KPIs.RevenueChange = revenueChange
	result.KPIs.Orders = data.currentCount
	result.KPIs.AverageTicket = averageTicket
	result.KPIs.OverdueAmount = round(data.overdueAmount)
	result.KPIs.LowStockProducts = data.lowStock
	result.Forecast.Next30DaysRevenue = forecast30
	result.Forecast.Method = "30-day run-rate adjusted by 7-day trend"

	if revenueChange <= -20 {
		result.Insights = append(result.Insights, Insight{
			ID: "revenue-drop", Severity: "critical", Category: "sales", Title: "انخفاض واضح في المبيعات",
			Body:   fmt.Sprintf("الإيراد أقل بنسبة %s%% من الثلاثين يومًا السابقة. راجع المنتجات والعروض وقنوات البيع.", fixed1(math.Abs(revenueChange))),
			Metric: revenueChange, Unit: "%",
		})
	} else if revenueChange >= 20 {
		result.Insights = append(result.Insights, Insight{
			ID: "revenue-growth", Severity: "info", Category: "sales", Title: "نمو قوي في المبيعات",
			Body:   fmt.Sprintf("الإيراد ارتفع بنسبة %s%% مقارنة بالفترة السابقة.", fixed1(revenueChange)),
			Metric: revenueChange, Unit: "%",
		})
	}
	if weeklyChange <= -15 {
		result.Insights = append(result.Insights, Insight{
			ID: "weekly-drop", Severity: "warning", Category: "trend", Title: "تباطؤ حديث",
			Body:   fmt.Sprintf("آخر 7 أيام أقل بنسبة %s%% من الأيام السبعة السابقة.", fixed1(math.Abs(weeklyChange))),
			Metric: weeklyChange, Unit: "%",
		})
	}
	if len(products) > 0 {
		topProduct := products[0]
		result.Insights = append(result.Insights, Insight{
			ID: "top-product", Severity: "info", Category: "products", Title: "المنتج الأقوى",
			Body:   fmt.Sprintf("%s هو الأعلى إيرادًا خلال آخر 30 يومًا، بهامش تقديري %s%%.", topProduct.Title, fixed1(topProduct.Margin)),
			Metric: topProduct.Revenue, Unit: "ILS",
		})
	}
	if data.lowStock > 0 {
		severity := "warning"
		if data.lowStock >= 10 {
			severity = "critical"
		}
		result.Insights = append(result.Insights, Insight{
			ID: "low-stock", Severity: severity, Category: "inventory", Title: "مخزون يحتاج متابعة",
			Body:   fmt.Sprintf("%d منتجًا عند حد المخزون المنخفض أو تحته.", data.lowStock),
			Metric: float64(data.lowStock), Unit: "products",
		})
	}
	if data.overdueAmount > 0 {
		result.Insights = append(result.Insights, Insight{
			ID: "overdue", Severity: "warning", Category: "debts", Title: "ديون متأخرة",
			Body:   fmt.Sprintf("هناك %d عملية متأخرة بقيمة %s ₪.", data.overdueCount, jsNumber(data.overdueAmount)),
			Metric: data.overdueAmount, Unit: "ILS",
		})
	}
	if data.customerCount > 0 {
		average := 0.0
		if data.customerAverage.Valid {
			average = data.customerAverage.Float64
		}
		result.Insights = append(result.Insights, Insight{
			ID: "customers", Severity: "info", Category: "customers", Title: "قيمة العميل",
			Body:   fmt.Sprintf("متوسط الإنفاق المسجل للعميل حوالي %s ₪. ركّز على إعادة تنشيط العملاء غير النشطين.", jsNumber(round(average))),
			Metric: average, Unit: "ILS",
		})
	}

	return result
}

// round follows JavaScript Math.round(value * 100) / 100, including negative
// half-cent values, rather than Go's ties-away-from-zero math.Round behavior.
func round(value float64) float64 {
	return math.Floor(value*100+0.5) / 100
}

func percentageChange(current, previous float64) float64 {
	if previous == 0 {
		if current > 0 {
			return 100
		}
		return 0
	}
	return round(((current - previous) / previous) * 100)
}

func fixed1(value float64) string {
	rounded := math.Floor(math.Abs(value)*10+0.5) / 10
	if math.Signbit(value) {
		rounded = -rounded
	}
	return strconv.FormatFloat(rounded, 'f', 1, 64)
}

func jsNumber(value float64) string {
	if value == 0 {
		return "0"
	}
	return strconv.FormatFloat(value, 'f', -1, 64)
}
