package adminexport

import "testing"

func TestEscapeCSVCellMatchesExpressFormulaAndRFC4180Rules(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "plain", in: "safe value", want: "safe value"},
		{name: "comma", in: "a,b", want: `"a,b"`},
		{name: "quote", in: `a"b`, want: `"a""b"`},
		{name: "newline", in: "first\nsecond", want: "\"first\nsecond\""},
		{name: "formula", in: "=1+1", want: "'=1+1"},
		{name: "formula with comma", in: "=SUM(A1,A2)", want: `"'=SUM(A1,A2)"`},
		{name: "leading tab", in: "\tcmd", want: "'\tcmd"},
		{name: "leading carriage return", in: "\rcmd", want: "\"'\rcmd\""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := escapeCSVCell(tc.in); got != tc.want {
				t.Fatalf("escapeCSVCell(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestWriteCSVRowDoesNotAddTrailingNewline(t *testing.T) {
	var output testStringWriter
	wroteRow := false
	if err := writeCSVRow(&output, &wroteRow, []string{"a", "b"}); err != nil {
		t.Fatal(err)
	}
	if err := writeCSVRow(&output, &wroteRow, []string{"1", "2"}); err != nil {
		t.Fatal(err)
	}
	if got, want := output.value, "a,b\n1,2"; got != want {
		t.Fatalf("CSV = %q, want %q", got, want)
	}
}

type testStringWriter struct{ value string }

func (w *testStringWriter) Write(p []byte) (int, error) {
	w.value += string(p)
	return len(p), nil
}
