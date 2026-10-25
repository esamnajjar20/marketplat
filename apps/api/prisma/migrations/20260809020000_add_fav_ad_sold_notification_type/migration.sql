-- Gap #15: notify favoriters when a favorited ad transitions to SOLD
-- (previously only a price change triggered a notification).
ALTER TYPE "NotificationType" ADD VALUE 'FAV_AD_SOLD';
