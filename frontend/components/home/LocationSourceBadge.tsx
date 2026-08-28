import { MapPin } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';
import { formatRadiusLabel } from '@/lib/progressiveRadius';

export type DisplayedLocationSource = 'gps' | 'city' | 'general';

interface Props {
  source: DisplayedLocationSource;
  city?: string;
  /** نصف القطر الفعلي عند البحث الجغرافي */
  radiusKm?: number | null;
}

/**
 * مؤشر مصدر النتائج — مع عرض النطاق عند GPS (مثل: ضمن 5 كم).
 */
export function LocationSourceBadge({ source, city, radiusKm }: Props) {
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

  return (
    <Badge variant="outline" className="font-normal text-muted-foreground">
      نتائج مقترحة
    </Badge>
  );
}
