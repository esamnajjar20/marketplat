'use client';
import { memo } from 'react';
import Link from 'next/link';
import { Star, Trash2, Pin } from 'lucide-react';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Checkbox } from '@/components/shared/ui/Checkbox';
import { Tooltip } from '@/components/shared/ui/Tooltip';
import type { AdminAd } from '@/types/admin.types';
import { ROUTES, STATUS_LABELS } from '@/lib/constants';
import { AD_STATUS_VARIANT } from '@/lib/adStatus';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { getThumbnailUrl, PLACEHOLDER_SVG } from '@/lib/cloudinary';

type Props = {
  ad: AdminAd; selected: boolean;
  pendingToggle: { adId: string; field: 'featured' | 'pinned' } | null;
  onToggle: (id: string) => void; onToggleFeatured: (id: string, next: boolean) => void;
  onTogglePinned: (id: string, next: boolean) => void; onDelete: (id: string) => void;
};

export const AdminAdRow = memo(function AdminAdRow({ ad, selected, pendingToggle, onToggle, onToggleFeatured, onTogglePinned, onDelete }: Props) {
  const thumb = ad.images[0] ? getThumbnailUrl(ad.images[0], 80, 60) : PLACEHOLDER_SVG;
  return (
<tr key={ad.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Checkbox
                        checked={selected}
                        onChange={() => onToggle(ad.id)}
                        aria-label={`تحديد ${ad.title}`}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="relative w-12 h-9 rounded overflow-hidden bg-muted shrink-0">
                          <SafeImage src={thumb} alt={ad.title} fill className="object-cover" sizes="48px" />
                        </div>
                        <div className="min-w-0">
                          <Link prefetch={false} href={ROUTES.adDetail(ad.id)} className="font-medium hover:underline line-clamp-1"
                            target="_blank" rel="noopener noreferrer">{ad.title}</Link>
                          {ad.isFeatured && <Badge variant="outline" className="text-xs border-warning text-warning">مميز</Badge>}
                          {ad.isPinned   && <Badge variant="outline" className="text-xs me-1">مثبّت</Badge>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{ad.user?.name ?? '—'}</td>
                    <td className="p-3 font-semibold">{formatPrice(ad.price)}</td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge
                        variant={AD_STATUS_VARIANT[ad.status]}
                        className="text-xs"
                      >
                        {STATUS_LABELS[ad.status] ?? ad.status}
                      </Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatRelativeTime(ad.createdAt)}</td>
                    <td className="p-3">
                      {/* FIX A11Y-01: title alone isn't reliably
                          announced by screen readers / has no keyboard
                          equivalent — aria-label is the real accessible
                          name here, and reflects the actual action
                          (toggle on/off) rather than a static label. */}
                      {/* DESKTOP-AUDIT-01: title= → Tooltip, matching
                          AdminAuditLogsTable. Content now tracks the
                          actual toggle state (was static "تمييز"/"تثبيت"
                          regardless of ad.isFeatured/isPinned — aria-label
                          already had the correct dynamic text, the visual
                          hint just hadn't caught up to it). */}
                      <div className="flex gap-1 justify-end">
                        <Tooltip content={ad.isFeatured ? 'إلغاء تمييز' : 'تمييز'}>
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            aria-label={ad.isFeatured ? `إلغاء تمييز ${ad.title}` : `تمييز ${ad.title}`}
                            disabled={pendingToggle?.adId === ad.id && pendingToggle.field === 'featured'}
                            onClick={() => onToggleFeatured(ad.id, !ad.isFeatured)}>
                            <Star className={`h-3.5 w-3.5 ${ad.isFeatured ? 'fill-warning text-warning' : ''}`} />
                          </Button>
                        </Tooltip>
                        <Tooltip content={ad.isPinned ? 'إلغاء تثبيت' : 'تثبيت'}>
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            aria-label={ad.isPinned ? `إلغاء تثبيت ${ad.title}` : `تثبيت ${ad.title}`}
                            disabled={pendingToggle?.adId === ad.id && pendingToggle.field === 'pinned'}
                            onClick={() => onTogglePinned(ad.id, !ad.isPinned)}>
                            <Pin className={`h-3.5 w-3.5 ${ad.isPinned ? 'text-primary' : ''}`} />
                          </Button>
                        </Tooltip>
                        <Tooltip content="حذف">
                          <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive"
                            aria-label={`حذف ${ad.title}`}
                            onClick={() => onDelete(ad.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
});
