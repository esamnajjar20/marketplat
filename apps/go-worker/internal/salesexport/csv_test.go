package salesexport

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/csv"
	"errors"
	"io"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestParseOptionsAcceptsSellerScopedFilters(t *testing.T) {
	values := url.Values{
		"userId":  {"seller-1"},
		"storeId": {"store-1"},
		"status":  {"PARTIAL"},
		"from":    {"2026-01-01T00:00:00.000Z"},
		"to":      {"2026-01-31T23:59:59.999Z"},
		"limit":   {"5000"},
	}
	options, err := ParseOptions(values)
	if err != nil {
		t.Fatalf("ParseOptions returned error: %v", err)
	}
	if options.SellerID != "seller-1" || options.StoreID != "store-1" || options.Status != "PARTIAL" || options.Limit != 5000 {
		t.Fatalf("unexpected options: %#v", options)
	}
}

func TestParseOptionsRejectsInvalidOrUnboundedInput(t *testing.T) {
	cases := []url.Values{
		{"storeId": {"store-1"}},
		{"userId": {"seller-1"}, "status": {"UNKNOWN"}},
		{"userId": {"seller-1"}, "limit": {"5001"}},
		{"userId": {"seller-1"}, "from": {"not-a-date"}},
	}
	for index, values := range cases {
		if _, err := ParseOptions(values); err == nil {
			t.Errorf("case %d should be rejected", index)
		}
	}
}

func TestParseOptionsRejectsReversedDateRange(t *testing.T) {
	values := url.Values{
		"userId": {"seller-1"},
		"from":   {"2026-02-01T00:00:00Z"},
		"to":     {"2026-01-01T00:00:00Z"},
	}
	if _, err := ParseOptions(values); err == nil {
		t.Fatal("expected reversed date range to be rejected")
	}
}

func TestEscapeCellPreventsSpreadsheetFormulaInjection(t *testing.T) {
	if got, want := escapeCell("=1+1"), "'=1+1"; got != want {
		t.Fatalf("escapeCell() = %q, want %q", got, want)
	}
	if got, want := escapeCell("-1+2"), "'-1+2"; got != want {
		t.Fatalf("formula-like negative text = %q, want %q", got, want)
	}
	if got, want := escapeCell("-12.50"), "-12.50"; got != want {
		t.Fatalf("negative amount = %q, want %q", got, want)
	}
	if got, want := escapeCell("-NaN"), "'-NaN"; got != want {
		t.Fatalf("negative formula-like text = %q, want %q", got, want)
	}
	if got, want := escapeCell("a,b\"c"), `"a,b""c"`; got != want {
		t.Fatalf("escapeCell() = %q, want %q", got, want)
	}
}

func TestDateFormattingUsesUTC(t *testing.T) {
	value := time.Date(2026, 10, 31, 1, 2, 3, 4000000, time.FixedZone("test", 2*60*60))
	if got, want := value.UTC().Format("2006-01-02T15:04:05.000Z"), "2026-10-30T23:02:03.004Z"; got != want {
		t.Fatalf("UTC format = %q, want %q", got, want)
	}
}

type fixtureConnector struct {
	query string
	args  []driver.NamedValue
	rows  driver.Rows
}

func (c *fixtureConnector) Connect(context.Context) (driver.Conn, error) {
	return &fixtureConn{connector: c}, nil
}

func (c *fixtureConnector) Driver() driver.Driver { return fixtureDriver{} }

type fixtureDriver struct{}

func (fixtureDriver) Open(string) (driver.Conn, error) {
	return nil, errors.New("fixture driver must be opened through Connector")
}

type fixtureConn struct{ connector *fixtureConnector }

func (c *fixtureConn) Prepare(string) (driver.Stmt, error) {
	return nil, errors.New("Prepare is not supported")
}
func (c *fixtureConn) Close() error { return nil }
func (c *fixtureConn) Begin() (driver.Tx, error) {
	return nil, errors.New("transactions are not supported")
}
func (c *fixtureConn) QueryContext(_ context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	c.connector.query = query
	c.connector.args = append([]driver.NamedValue(nil), args...)
	return c.connector.rows, nil
}

type fixtureRows struct {
	columns []string
	values  []driver.Value
	sent    bool
}

func (r *fixtureRows) Columns() []string { return r.columns }
func (r *fixtureRows) Close() error      { return nil }
func (r *fixtureRows) Next(destination []driver.Value) error {
	if r.sent {
		return io.EOF
	}
	copy(destination, r.values)
	r.sent = true
	return nil
}

func TestWriteCSVStreamsSellerScopedReportAndKeepsNegativeProfit(t *testing.T) {
	fixture := &fixtureConnector{
		rows: &fixtureRows{
			columns: []string{"invoice", "soldAt", "buyer", "store", "title", "quantity", "revenue", "cost", "profit", "paid", "due", "refunded", "status"},
			values: []driver.Value{
				"INV-1",
				time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC),
				`=HYPERLINK("https://example.invalid")`,
				"متجر, تجريبي",
				"منتج\nمميز",
				int64(2),
				"100.00",
				"120.00",
				"-20.00",
				"100.00",
				"0.00",
				"0.00",
				"PAID",
			},
		},
	}
	db := sql.OpenDB(fixture)
	defer db.Close()

	from := time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 10, 31, 23, 59, 59, 0, time.UTC)
	var output bytes.Buffer
	err := WriteCSV(context.Background(), db, &output, Options{
		SellerID: "seller-1",
		StoreID:  "store-1",
		Status:   "PAID",
		From:     &from,
		To:       &to,
		Limit:    5000,
	})
	if err != nil {
		t.Fatalf("WriteCSV returned error: %v", err)
	}

	if !strings.Contains(fixture.query, `sale."sellerId" = $1`) ||
		!strings.Contains(fixture.query, `WITH selected_sales AS MATERIALIZED`) ||
		!strings.Contains(fixture.query, `LEFT JOIN LATERAL`) {
		t.Fatalf("query is missing seller scoping or bounded item aggregation: %s", fixture.query)
	}
	if got, want := len(fixture.args), 6; got != want {
		t.Fatalf("query argument count = %d, want %d", got, want)
	}
	if fixture.args[0].Value != "seller-1" || fixture.args[1].Value != "store-1" || fixture.args[2].Value != "PAID" {
		t.Fatalf("unexpected query scope arguments: %#v", fixture.args)
	}

	csvText := strings.TrimPrefix(output.String(), "\uFEFF")
	parsed, err := csv.NewReader(strings.NewReader(csvText)).ReadAll()
	if err != nil {
		t.Fatalf("CSV could not be parsed: %v", err)
	}
	if len(parsed) != 2 || len(parsed[1]) != 13 {
		t.Fatalf("unexpected CSV shape: %#v", parsed)
	}
	if got, want := parsed[1][2], `'=HYPERLINK("https://example.invalid")`; got != want {
		t.Fatalf("formula cell = %q, want %q", got, want)
	}
	if got, want := parsed[1][8], "-20.00"; got != want {
		t.Fatalf("negative profit = %q, want %q", got, want)
	}
	if got, want := parsed[1][3], "متجر, تجريبي"; got != want {
		t.Fatalf("quoted store name = %q, want %q", got, want)
	}
}
