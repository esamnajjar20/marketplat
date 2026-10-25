-- Durable, admin-managed feature switch for the site-wide developer toolbox.
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'ADMIN_DEVELOPER_TOOLS_CHANGED';

CREATE TABLE IF NOT EXISTS "platform_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "platform_settings_pkey" PRIMARY KEY ("key")
);
