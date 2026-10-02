-- 20260917121810_drop_legacy_service_broadcasts dropped the tables and the
-- ServiceQuoteStatus enum but left ServiceBroadcastStatus behind. Nothing
-- references it any more (service_request_broadcasts is gone).

-- DropEnum
DROP TYPE IF EXISTS "ServiceBroadcastStatus";
