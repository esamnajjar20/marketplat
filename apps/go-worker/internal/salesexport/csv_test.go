package salesexport

import (
	"bytes"
	"context"
	"database/sql"
	"database/sql/driver"
	"encoding/csv"
	"errors"
	"fmt"
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
	}
	options, err := ParseOptions(values)
	if err != nil {
		t.Fatalf("ParseOptions returned error: %v", err)
	}
	if options.SellerID != "seller-1" || options.StoreID != "store-1" || options.Status != "PARTIAL" {
		t.Fatalf("unexpected options: %#v", options)
	}
}

func TestParseOptionsRejectsInvalidOrUnboundedInput(t *testing.T) {
	cases := []url.Values{
		{"storeId": {"store-1"}},
		{"userId": {"seller-1"}, "status": {"UNKNOWN"}},
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
	query      string
	args       []driver.NamedValue
	rows       driver.Rows
	rowPages   []driver.Rows
	queryCount int
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
	c.connector.queryCount++
	if len(c.connector.rowPages) > 0 {
		index := c.connector.queryCount - 1
		if index < len(c.connector.rowPages) {
			return c.connector.rowPages[index], nil
		}
		return &fixtureRows{columns: []string{}}, nil
	}
	return c.connector.rows, nil
}

type fixtureRows struct {
	columns   []string
	values    []driver.Value
	allValues [][]driver.Value
	index     int
	sent      bool
}

func (r *fixtureRows) Columns() []string { return r.columns }
func (r *fixtureRows) Close() error      { return nil }
func (r *fixtureRows) Next(destination []driver.Value) error {
	if len(r.allValues) > 0 {
		if r.index >= len(r.allValues) {
			return io.EOF
		}
		copy(destination, r.allValues[r.index])
		r.index++
		return nil
	}
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
			columns: []string{"id", "invoice", "soldAt", "buyer", "store", "title", "quantity", "revenue", "cost", "profit", "paid", "due", "refunded", "status"},
			values: []driver.Value{
				"sale-1",
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
	})
	if err != nil {
		t.Fatalf("WriteCSV returned error: %v", err)
	}

	if !strings.Contains(fixture.query, `sale."sellerId" = $1`) ||
		!strings.Contains(fixture.query, `WITH selected_sales AS MATERIALIZED`) ||
		!strings.Contains(fixture.query, `LEFT JOIN LATERAL`) ||
		!strings.Contains(fixture.query, `ORDER BY sale."soldAt" DESC, sale."id" DESC`) {
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

func TestWriteCSVContinuesBeyondFirstFiveThousandRowsWithKeysetCursor(t *testing.T) {
	columns := []string{"id", "invoice", "soldAt", "buyer", "store", "title", "quantity", "revenue", "cost", "profit", "paid", "due", "refunded", "status"}
	stamp := time.Date(2026, 10, 30, 12, 0, 0, 0, time.UTC)
	firstPage := &fixtureRows{columns: columns}
	for index := 5000; index >= 1; index-- {
		firstPage.allValues = append(firstPage.allValues, []driver.Value{
			fmt.Sprintf("sale-%05d", index), "", stamp, "Buyer", "Store", "Item", int64(1),
			"10.00", "1.00", "9.00", "10.00", "0.00", "0.00", "PAID",
		})
	}
	secondPage := &fixtureRows{columns: columns, allValues: [][]driver.Value{{
		"sale-00000", "INV-LAST", stamp.Add(-time.Hour), "Buyer", "Store", "Last", int64(1),
		"10.00", "1.00", "9.00", "10.00", "0.00", "0.00", "PAID",
	}}}
	fixture := &fixtureConnector{rowPages: []driver.Rows{firstPage, secondPage}}
	db := sql.OpenDB(fixture)
	defer db.Close()

	var output bytes.Buffer
	if err := WriteCSV(context.Background(), db, &output, Options{SellerID: "seller-1"}); err != nil {
		t.Fatalf("WriteCSV returned error: %v", err)
	}
	if fixture.queryCount != 2 {
		t.Fatalf("query count = %d, want 2 pages", fixture.queryCount)
	}
	if !strings.Contains(fixture.query, `(sale."soldAt", sale."id") < ($2, $3)`) {
		t.Fatalf("second query is missing the composite keyset cursor: %s", fixture.query)
	}
	if got := fixture.args[2].Value; got != "sale-00001" {
		t.Fatalf("cursor id = %#v, want last id from first page", got)
	}
	parsed, err := csv.NewReader(strings.NewReader(strings.TrimPrefix(output.String(), "\uFEFF"))).ReadAll()
	if err != nil {
		t.Fatalf("CSV could not be parsed: %v", err)
	}
	if len(parsed) != 5002 {
		t.Fatalf("CSV records = %d, want header plus 5,001 rows", len(parsed))
	}
	if parsed[len(parsed)-1][0] != "INV-LAST" {
		t.Fatalf("last exported invoice = %q, want INV-LAST", parsed[len(parsed)-1][0])
	}
}
