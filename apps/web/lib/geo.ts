/**
 * إعدادات الموقع — وضع غزة.
 *
 * صندوق تقريبي لقطاع غزة مع هامش ~2–3 كم لاستيعاب خطأ GPS:
 *   lat ≈ 31.22 … 31.60
 *   lng ≈ 34.20 … 34.57
 */
export const GAZA_BOUNDS = {
  minLat: 31.20,
  maxLat: 31.62,
  minLng: 34.18,
  maxLng: 34.60,
} as const;

/** خيارات Geolocation مُحسَّنة للدقة داخل غزة */
export const GEO_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15_000,
  maximumAge: 60_000, // دقيقة واحدة — كان 5 دقائق
};

/** نصف قطر البحث «قريب مني» الافتراضي (أنسب لمساحة القطاع) */
export const DEFAULT_NEARBY_RADIUS_KM = 7;

/** أقصى مسافة عرض منطقية داخل/حول غزة */
export const MAX_SANE_DISTANCE_KM = 80;

export function isWithinGaza(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return (
    lat >= GAZA_BOUNDS.minLat &&
    lat <= GAZA_BOUNDS.maxLat &&
    lng >= GAZA_BOUNDS.minLng &&
    lng <= GAZA_BOUNDS.maxLng
  );
}

/**
 * يتحقق من صلاحية الإحداثيات للاستخدام في البحث القريب.
 * يرفض القيم خارج صندوق غزة (مع هامش) لتقليل المسافات الشاذة.
 */
export function isUsableNearbyCoord(lat: number, lng: number): boolean {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  // هامش أوسع قليلاً من صندوق غزة الصارم (مستخدم مسافر على الحدود)
  return lat >= 31.0 && lat <= 32.0 && lng >= 34.0 && lng <= 35.0;
}

export function sanitizeDistanceKm(
  value: number | null | undefined,
): number | null {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n > MAX_SANE_DISTANCE_KM) return null;
  return n;
}

export function formatDistanceKm(
  value: number | null | undefined,
): string | null {
  const km = sanitizeDistanceKm(value);
  if (km == null) return null;
  if (km < 1) return `${Math.round(km * 1000)} م`;
  return `${km.toFixed(1)} كم`;
}
