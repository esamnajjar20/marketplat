/**
 * توسيع تدريجي لنطاق البحث الجغرافي — مُعدّ لمساحة قطاع غزة.
 *
 * سابقاً: 1 → 5 → 10 → 25 → 100 (واسع جداً ويخلط الشمال بالجنوب مبكراً)
 * الآن:   1 → 3 → 7 → 15 → 40
 *   - 1–3 كم: حي / منطقة قريبة
 *   - 7 كم: جزء معتبر من المدينة/القطاع
 *   - 15 كم: يغطي معظم القطاع من نقطة وسطية
 *   - 40 كم: احتياط عند قلة النتائج (ما زال ضمن max API = 100)
 *
 * سياسة الظهور مع الموقع:
 * - يُختار أصغر نطاق فيه نتيجة واحدة على الأقل.
 * - العناصر ACTIVE فقط (يفرضها الـ backend).
 * - مع فلتر مدينة صريح: لا يُفرض نصف قطر GPS فوق المدينة.
 */
export const PROGRESSIVE_RADIUS_KM = [1, 3, 7, 15, 40] as const;

export type ProgressiveRadiusKm = (typeof PROGRESSIVE_RADIUS_KM)[number];

export const MIN_RESULTS_ACCEPT = 1;

export function pickProgressiveRadiusIndex(
  counts: number[],
  minAccept: number = MIN_RESULTS_ACCEPT,
): number | null {
  for (let i = 0; i < counts.length; i++) {
    if ((counts[i] ?? 0) >= minAccept) return i;
  }
  return null;
}

export function formatRadiusLabel(km: number): string {
  if (km >= 40) return 'نطاق واسع';
  return `ضمن ${km} كم`;
}
