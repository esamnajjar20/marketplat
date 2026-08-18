import { MapPin } from 'lucide-react';
import { Badge } from '@/components/shared/ui/Badge';

export type DisplayedLocationSource = 'gps' | 'city' | 'general';

interface Props {
  source: DisplayedLocationSource;
  city?: string;
}

/**
 * "مؤشر مصدر النتائج" — a small, single pill next to a section's
 * title showing which location source actually produced the results
 * currently shown (not which source the resolver picked — a section
 * whose GPS/city query cascaded to general per its own fallback logic
 * must show "نتائج مقترحة" here, never "قريب منك", since the results
 * aren't actually distance-based in that case). Shared by RecentAds
 * and NearbyProvidersSection so the copy/behavior stays identical
 * instead of two hand-rolled versions drifting apart.
 */
export function LocationSourceBadge({ source, city }: Props) {
  if (source === 'gps') {
    return (
      <Badge variant="secondary" className="gap-1 font-normal">
        <MapPin className="h-3 w-3" />
        قريب منك
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
