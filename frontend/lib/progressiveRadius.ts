/**
 * توسيع تدريجي لنطاق البحث الجغرافي.
 * 1 → 5 → 10 → 25 → 100 كم (100 ≈ «الكل» ضمن حد الـ API الأقصى).
 *
 * سياسة الظهور مع الموقع:
 * - يُختار أصغر نطاق فيه نتيجة واحدة على الأقل.
 * - العناصر ACTIVE فقط (يفرضها الـ backend في /search والقوائم العامة).
 * - عناصر بلا إحداثيات: لا تُستبعد من الواجهة؛ سلوكها من الـ backend
 *   (غالبًا تظهر مع نتائج المدينة/العامة أو داخل النطاق إن لم يُقيَّد الـ pin).
 * - مع فلتر مدينة صريح: لا يُفرض نصف قطر GPS فوق المدينة.
 */
export const PROGRESSIVE_RADIUS_KM = [1, 5, 10, 25, 100] as const;

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
  if (km >= 100) return 'نطاق واسع';
  return `ضمن ${km} كم`;
}
