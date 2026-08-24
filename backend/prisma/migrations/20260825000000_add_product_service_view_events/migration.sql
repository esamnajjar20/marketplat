-- PR4A (recommendation view signals): real PRODUCT_VIEW/SERVICE_VIEW
-- events, so the product/service recommendation rails can gain a
-- "recently viewed" signal the same way the AD rail already has via
-- AnalyticsEventType.AD_VIEW. Additive only — AD_VIEW's existing rows
-- and behavior are untouched.
ALTER TYPE "AnalyticsEventType" ADD VALUE 'PRODUCT_VIEW';
ALTER TYPE "AnalyticsEventType" ADD VALUE 'SERVICE_VIEW';
