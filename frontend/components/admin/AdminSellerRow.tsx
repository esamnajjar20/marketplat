'use client';
import { memo } from 'react';
import { ShieldOff, ShieldCheck, BadgeCheck, BadgeX, Star } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Checkbox } from '@/components/shared/ui/Checkbox';
import { Tooltip } from '@/components/shared/ui/Tooltip';
import type { AdminSeller } from '@/types/admin.types';
import { formatDate } from '@/lib/formatters';

type Props = { seller: AdminSeller; selected: boolean; pendingVerifyId?: string; pendingSuspendId?: string; onToggle: (id: string) => void; onSetVerified: (id: string, verified: boolean) => void; onSetSuspended: (id: string, suspended: boolean) => void; onSuspendRequest: (id: string, name: string) => void; };

export const AdminSellerRow = memo(function AdminSellerRow({ seller, selected, pendingVerifyId, pendingSuspendId, onToggle, onSetVerified, onSetSuspended, onSuspendRequest }: Props) {
  return (
<tr key={seller.id} className="hover:bg-muted/30 transition-colors">
                  <td className="p-3">
                    <Checkbox
                      checked={selected}
                      onChange={() => onToggle(seller.id)}
                      aria-label={`تحديد ${seller.displayName}`}
                    />
                  </td>
                  <td className="p-3">
                    <span className="font-medium">{seller.displayName}</span>
                    <span className="block text-xs text-muted-foreground md:hidden">{seller.user.email}</span>
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{seller.user.email}</td>
                  <td className="p-3 hidden sm:table-cell">
                    {seller.totalRatings > 0 ? (
                      <span className="inline-flex items-center gap-1 text-xs">
                        <Star className="h-3.5 w-3.5 fill-warning text-warning" />
                        {Number(seller.averageRating).toFixed(1)}
                        <span className="text-muted-foreground">({seller.totalRatings})</span>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">لا يوجد تقييم</span>
                    )}
                  </td>
                  <td className="p-3">
                    <Badge variant={seller.verified ? 'success' : 'secondary'} className="text-xs">
                      {seller.verified ? 'موثّق' : 'غير موثّق'}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={seller.suspended ? 'destructive' : 'success'} className="text-xs">
                      {seller.suspended ? 'موقوف' : 'نشط'}
                    </Badge>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                    {formatDate(seller.createdAt)}
                  </td>
                  <td className="p-3">
                    {/* DESKTOP-AUDIT-01: title= → Tooltip, same pattern
                        as the other admin tables. */}
                    <div className="flex items-center gap-1">
                      <Tooltip content={seller.verified ? 'إلغاء التوثيق' : 'توثيق البائع'}>
                        <Button variant="ghost" size="icon" className="h-9 w-9"
                          aria-label={seller.verified ? `إلغاء توثيق ${seller.displayName}` : `توثيق ${seller.displayName}`}
                          disabled={pendingVerifyId === seller.id}
                          onClick={() => onSetVerified(seller.id, !seller.verified)}>
                          {seller.verified
                            ? <BadgeX className="h-3.5 w-3.5 text-muted-foreground" />
                            : <BadgeCheck className="h-3.5 w-3.5 text-success" />}
                        </Button>
                      </Tooltip>
                      <Tooltip content={seller.suspended ? 'رفع الإيقاف' : 'إيقاف البائع'}>
                        <Button variant="ghost" size="icon" className="h-9 w-9"
                          aria-label={seller.suspended ? `رفع الإيقاف عن ${seller.displayName}` : `إيقاف ${seller.displayName}`}
                          disabled={pendingSuspendId === seller.id}
                          onClick={() => {
                            // Un-suspending is low-risk and reversible with
                            // one click either way, so only the
                            // suspend direction goes through the dialog.
                            if (seller.suspended) {
                              onSetSuspended(seller.id, false);
                            } else {
                              onSuspendRequest(seller.id, seller.displayName);
                            }
                          }}>
                          {seller.suspended
                            ? <ShieldCheck className="h-3.5 w-3.5 text-success" />
                            : <ShieldOff className="h-3.5 w-3.5 text-destructive" />}
                        </Button>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
  );
});
