package weeklyreports

import "testing"

func TestArabicReportBodies(t *testing.T) {
	cases := []struct {
		kind  Kind
		delta int64
		want  string
	}{
		{Ads, 1, "حصل إعلانك على مشاهدة جديدة هذا الأسبوع"},
		{Ads, 7, "حصلت إعلاناتك على 7 مشاهدة جديدة هذا الأسبوع"},
		{Stores, 1, "حصل متجرك على مشاهدة جديدة هذا الأسبوع"},
		{Services, 3, "حصلت خدماتك على 3 مشاهدة جديدة هذا الأسبوع"},
	}
	for _, tc := range cases {
		got, err := BodyForTest(tc.kind, tc.delta)
		if err != nil {
			t.Fatal(err)
		}
		if got != tc.want {
			t.Fatalf("BodyForTest(%q, %d) = %q; want %q", tc.kind, tc.delta, got, tc.want)
		}
	}
}

func TestUnknownReportKindRejected(t *testing.T) {
	if _, err := configFor(Kind("unknown")); err == nil {
		t.Fatal("expected unsupported report kind to fail")
	}
}
