-- Extend ReportTargetType for product & service listing reports
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'PRODUCT';
ALTER TYPE "ReportTargetType" ADD VALUE IF NOT EXISTS 'SERVICE_LISTING';
