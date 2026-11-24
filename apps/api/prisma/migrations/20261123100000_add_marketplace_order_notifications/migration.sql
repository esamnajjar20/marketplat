-- Dedicated notifications for the MarketplaceOrder lifecycle.
-- These events are intentionally separate from SaleRecord / POS notifications.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MARKETPLACE_ORDER_NEW';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'MARKETPLACE_ORDER_UPDATE';
