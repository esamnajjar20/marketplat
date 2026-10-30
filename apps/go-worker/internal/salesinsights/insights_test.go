package salesinsights

import (
	"database/sql"
	"strings"
	"testing"
	"time"
)

func TestPercentageChangeMatchesExpressBoundaries(t *testing.T) {
	cases := []struct {
		name     string
		current  float64
		previous float64
		want     float64
	}{
		{name: "growth from zero", current: 15, previous: 0, want: 100},
		{name: "flat zero", current: 0, previous: 0, want: 0},
		{name: "negative trend", current: 80, previous: 100, want: -20},
		{name: "positive trend", current: 125, previous: 100, want: 25},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := percentageChange(tc.current, tc.previous); got != tc.want {
				t.Fatalf("percentageChange(%v, %v) = %v, want %v", tc.current, tc.previous, got, tc.want)
			}
		})
	}
}

func TestRoundMatchesJavaScriptMathRoundForNegativeHalfCent(t *testing.T) {
	if got, want := round(-1.125), -1.12; got != want {
		t.Fatalf("round(-1.125) = %v, want %v", got, want)
	}
	if got, want := round(1.125), 1.13; got != want {
		t.Fatalf("round(1.125) = %v, want %v", got, want)
	}
}

func TestFixedOneMatchesJavaScriptToFixedForNegativeMargins(t *testing.T) {
	if got, want := fixed1(-1.25), "-1.3"; got != want {
		t.Fatalf("fixed1(-1.25) = %q, want %q", got, want)
	}
	if got, want := fixed1(1.25), "1.3"; got != want {
		t.Fatalf("fixed1(1.25) = %q, want %q", got, want)
	}
}

func TestBuildResultPreservesInsightRulesAndArabicMessages(t *testing.T) {
	now := time.Date(2026, 10, 30, 12, 30, 45, 123_000_000, time.FixedZone("test", 2*60*60))
	data := metrics{
		currentCount:    2,
		currentTotal:    100,
		currentRefunded: 10,
		previousTotal:   100,
		recent7Total:    30,
		prior7Total:     60,
		customerCount:   1,
		customerAverage: sql.NullFloat64{Float64: 250.5, Valid: true},
		lowStock:        10,
		overdueAmount:   75.5,
		overdueCount:    2,
	}
	products := []Product{{Title: "منتج", Revenue: 40, Cost: 20, Profit: 20, Margin: 50, Quantity: 3}}
	got := buildResult(now, data, products)

	if got.GeneratedAt != "2026-10-30T10:30:45.123Z" {
		t.Fatalf("GeneratedAt = %q", got.GeneratedAt)
	}
	if got.KPIs.Revenue != 90 || got.KPIs.RevenueChange != -10 || got.KPIs.AverageTicket != 45 {
		t.Fatalf("unexpected KPI values: %+v", got.KPIs)
	}
	if got.Forecast.Method != "30-day run-rate adjusted by 7-day trend" {
		t.Fatalf("unexpected forecast method: %q", got.Forecast.Method)
	}
	if len(got.Insights) != 5 {
		t.Fatalf("insights count = %d, want 5: %+v", len(got.Insights), got.Insights)
	}
	if got.Insights[1].ID != "top-product" || !strings.Contains(got.Insights[1].Body, "منتج") {
		t.Fatalf("top-product insight missing: %+v", got.Insights)
	}
	if got.Insights[2].Severity != "critical" || got.Insights[2].Metric != 10 {
		t.Fatalf("low-stock insight mismatch: %+v", got.Insights[2])
	}
}

func TestEmptyTopProductsAndZeroMetricsReturnNonNilArrays(t *testing.T) {
	got := buildResult(time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC), metrics{}, []Product{})
	if got.TopProducts == nil || got.Insights == nil {
		t.Fatal("empty arrays must encode as [] rather than null")
	}
	if got.KPIs.Revenue != 0 || got.KPIs.RevenueChange != 0 || got.Forecast.Next30DaysRevenue != 0 {
		t.Fatalf("unexpected zero-metric result: %+v", got)
	}
}
