import { MapPin } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { formatRadiusLabel } from '@/lib/progressiveRadius';

export type DisplayedLocationSource = 'gps' | 'city' | 'general';

interface Props {
  source: DisplayedLocationSource;
  city?: string;
  /** نصف القطر الفعلي عند البحث الجغرافي */
  radiusKm?: number | null;
  /** المدينة المطلوبة فعلاً؛ إن كانت النتائج عامة يُعرض سبب الرجوع للنتائج العامة. */
  requestedCity?: string;
  /** لا تعرض شارة "نتائج مقترحة" العامة عند عدم اختيار مدينة (تقليل التكرار في الرئيسية). */
  quiet?: boolean;
}

/**
 * مؤشر مصدر النتائج — مع عرض النطاق عند GPS (مثل: ضمن 5 كم).
 */
export function LocationSourceBadge({ source, city, radiusKm, requestedCity, quiet }: Props) {
  if (source === 'gps') {
    const label =
      radiusKm != null && radiusKm > 0
        ? formatRadiusLabel(radiusKm)
        : 'قريب منك';
    return (
      <Badge variant="secondary" className="gap-1 font-normal">
        <MapPin className="h-3 w-3" />
        {label}
      </Badge>
    );
  }

  if (source === 'city' && city) {
    return (
      <Badge variant="secondary" className="gap-1 font-normal">
        <MapPin className="h-3 w-3" />
        نتائج في {city}
      </Badge>
    );
  }

  if (source === 'general' && requestedCity) {
    return (
      <Badge variant="outline" className="font-normal text-muted-foreground">
        لا نتائج في {requestedCity} — نتائج عامة
      </Badge>
    );
  }

  if (quiet && source === 'general') return null;

  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      نتائج مقترحة
    </Badge>
  );
}
