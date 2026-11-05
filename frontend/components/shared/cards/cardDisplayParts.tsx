import { Badge } from '@/components/ui/badge';
import type { CardKind } from './cardTypes';

const KIND_BADGE: Record<CardKind, { label: string; className?: string; accent?: boolean }> = {
  ad: { label: 'إعلان', accent: true },
  product: { label: 'منتج', className: 'bg-cat-product text-white hover:bg-cat-product' },
  service: { label: 'خدمة', className: 'bg-cat-service text-white hover:bg-cat-service' },
};

/** Static badge presentation: safe to render directly from Server Components. */
export function CardKindBadge({ kind }: { kind: CardKind }) {
  const cfg = KIND_BADGE[kind];
  return <Badge size="xs" variant={cfg.accent ? 'accent' : 'default'} className={cfg.className}>{cfg.label}</Badge>;
}

/** Static view used by the tiny client connectivity adapter. */
export function CardOfflineBadgeView({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null;
  return <Badge size="xs" variant="overlay" className="absolute bottom-2 start-2 z-10">محفوظ محلي</Badge>;
}
