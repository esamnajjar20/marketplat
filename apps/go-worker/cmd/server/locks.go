package main


// PostgreSQL advisory-lock identifiers. They are shared with the Express
// fallback implementations, so a value must never be reused or renumbered:
// the Go worker and Express rely on the same ID to guarantee that only one
// copy of a given job runs at any time.
const (
	analyticsRetentionLockID    int64 = 731904281
	authTokenRetentionLockID    int64 = 731904282
	notificationRetentionLockID int64 = 731904283
	failedTaskRetentionLockID   int64 = 731904284
	notificationDigestLockID    int64 = 731904285
	weeklyAdViewsLockID         int64 = 731904286
	weeklyStoreViewsLockID      int64 = 731904287
	weeklyServiceViewsLockID    int64 = 731904288
	sellerResponseMetricsLockID int64 = 731904289
	salesDailyReminderLockID    int64 = 731904290
	salesDebtReminderLockID     int64 = 731904291
	salesInstallmentLockID      int64 = 731904292
	weeklySalesReportLockID     int64 = 731904293
	activityBufferLockID        int64 = 731904294
	viewsBufferLockID           int64 = 731904295
	openRequestExpiryLockID     int64 = 731904296
	staleBoostDemotionLockID    int64 = 731904297
	serviceRequestExpiryLockID  int64 = 731904298
	adExpiryLockID              int64 = 731904299
	storyCleanupLockID          int64 = 731904300
	promotionLifecycleLockID    int64 = 731904301
	mediaCleanupLockID          int64 = 731904302
)
