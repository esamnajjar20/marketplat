package pushdispatch

import (
	"encoding/json"
	"testing"
	"time"
)

func TestRetryDelayMatchesDispatchBackoffAndCapsAtOneHour(t *testing.T) {
	cases := []struct {
		attempt int
		want    time.Duration
	}{
		{attempt: -1, want: time.Second},
		{attempt: 0, want: time.Second},
		{attempt: 1, want: 2 * time.Second},
		{attempt: 2, want: 4 * time.Second},
		{attempt: 10, want: 1024 * time.Second},
		{attempt: 12, want: time.Hour},
		{attempt: 25, want: time.Hour},
	}
	for _, tc := range cases {
		if got := retryDelay(tc.attempt); got != tc.want {
			t.Errorf("retryDelay(%d) = %s, want %s", tc.attempt, got, tc.want)
		}
	}
}

func TestEvaluateQuietHoursOvernightWindow(t *testing.T) {
	loc, err := time.LoadLocation("Asia/Gaza")
	if err != nil {
		t.Fatal(err)
	}
	// 23:30 local time; default overnight window is 22:00–08:00.
	now := time.Date(2026, time.November, 2, 23, 30, 45, 0, loc)
	decision := evaluateQuietHours(map[string]any{"quietHoursEnabled": true}, false, now)
	if !decision.Blocked {
		t.Fatal("expected quiet hours to block delivery")
	}
	if decision.ResumeInMs != ((8*60+30)*60-45)*1000 {
		t.Fatalf("resume delay = %dms, want %dms", decision.ResumeInMs, ((8*60+30)*60-45)*1000)
	}
}

func TestEvaluateQuietHoursUrgentDefaultsToAllowed(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Gaza")
	now := time.Date(2026, time.November, 2, 23, 30, 0, 0, loc)
	prefs := map[string]any{"quietHoursEnabled": true}
	if got := evaluateQuietHours(prefs, true, now); got.Blocked {
		t.Fatal("urgent push must be allowed by default")
	}
	prefs["quietHoursAllowUrgent"] = false
	if got := evaluateQuietHours(prefs, true, now); !got.Blocked {
		t.Fatal("urgent push must be blocked when user disables urgent bypass")
	}
}

func TestEvaluateQuietHoursDaytimeWindowAndEqualBounds(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Gaza")
	prefs := map[string]any{
		"quietHoursEnabled":  true,
		"quietHoursStart":    "12:00",
		"quietHoursEnd":      "14:00",
		"quietHoursTimeZone": "Asia/Gaza",
	}
	inside := time.Date(2026, time.November, 2, 13, 0, 0, 0, loc)
	if !evaluateQuietHours(prefs, false, inside).Blocked {
		t.Fatal("expected daytime quiet-hours window to block")
	}
	prefs["quietHoursEnd"] = "12:00"
	if evaluateQuietHours(prefs, false, inside).Blocked {
		t.Fatal("equal start/end must disable the quiet-hours window")
	}
}

func TestParseClockValidatesAndClampsLikeExpress(t *testing.T) {
	cases := []struct {
		value any
		wantH int
		wantM int
	}{
		{value: "7:05", wantH: 7, wantM: 5},
		{value: "99:99", wantH: 23, wantM: 59},
		{value: "3x:20", wantH: 22, wantM: 0},
		{value: 12, wantH: 22, wantM: 0},
		{value: "3:2", wantH: 22, wantM: 0},
	}
	for _, tc := range cases {
		h, m := parseClock(tc.value, 22, 0)
		if h != tc.wantH || m != tc.wantM {
			t.Errorf("parseClock(%v) = %02d:%02d, want %02d:%02d", tc.value, h, m, tc.wantH, tc.wantM)
		}
	}
}

func TestPayloadParsesExistingDispatchShape(t *testing.T) {
	body := []byte(`{"title":"تنبيه","body":"لديك تحديث","url":"/notifications","tag":"market-update","image":"https://cdn.example/image.webp","type":"NEW_MESSAGE","urgent":true,"bypassQuietHours":false}`)
	var payload Payload
	if err := json.Unmarshal(body, &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Title != "تنبيه" || payload.Body != "لديك تحديث" || payload.URL != "/notifications" || payload.Tag != "market-update" || payload.Type != "NEW_MESSAGE" || !payload.Urgent {
		t.Fatalf("payload was not decoded as expected: %+v", payload)
	}
}
