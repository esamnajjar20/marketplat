'use client';
import { memo } from 'react';
import { CheckCircle2, Ban, RotateCcw, Star } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Checkbox } from '@/components/shared/ui/Checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { Tooltip } from '@/components/shared/ui/Tooltip';
import type { AdminStore, AdminStoreStatus, AdminStoreType } from '@/types/admin.types';
import { formatDate } from '@/lib/formatters';
import { STORE_STATUS_LABELS, STORE_STATUS_VARIANT } from '@/lib/storeStatus';

type Props = { store: AdminStore; selected: boolean; pendingId?: string; pendingTypeId?: string; storeTypes: AdminStoreType[]; onToggle: (id: string) => void; onUpdateStatus: (id: string, status: AdminStoreStatus) => void; onUpdatePlan: (id: string, plan: 'FREE' | 'FEATURED') => void; onUpdateType: (id: string, typeId: string) => void; onBlock: (id: string, name: string) => void; };

export const AdminStoreRow = memo(function AdminStoreRow({ store, selected, pendingId, pendingTypeId, storeTypes, onToggle, onUpdateStatus, onUpdatePlan, onUpdateType, onBlock }: Props) {
  const badge = { label: STORE_STATUS_LABELS[store.status], variant: STORE_STATUS_VARIANT[store.status] };
  return (
<tr key={store.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <Checkbox
                        checked={selected}
                        onChange={() => onToggle(store.id)}
                        aria-label={`تحديد متجر ${store.name}`}
                      />
                    </td>
                    <td className="p-3">
                      <span className="font-medium">{store.name}</span>
                      <span className="block text-xs text-muted-foreground md:hidden">
                        {store.sellerProfile.displayName}
                      </span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">
                      {store.sellerProfile.displayName}
                    </td>
                    <td className="p-3 hidden sm:table-cell text-muted-foreground">{store.city}</td>
                    <td className="p-3 hidden lg:table-cell">
                      <Select
                        value={store.storeTypeId}
                        onValueChange={(storeTypeId) => onUpdateType(store.id, storeTypeId)}
                        disabled={pendingTypeId === store.id}
                      >
                        <SelectTrigger className="h-8 min-w-28 text-xs">
                          <SelectValue placeholder="نوع المتجر" />
                        </SelectTrigger>
                        <SelectContent>
                          {storeTypes.map((type) => <SelectItem key={type.id} value={type.id}>{type.nameAr}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="p-3">
                      <Badge variant={badge.variant} className="text-xs">{badge.label}</Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">
                      {formatDate(store.createdAt)}
                    </td>
                    <td className="p-3">
                      {/* DESKTOP-AUDIT-01: title= → Tooltip across this
                          row's four actions, same pattern as
                          AdminAuditLogsTable/AdminAdsTable/AdminUsersTable. */}
                      <div className="flex items-center gap-1">
                        {store.status !== 'ACTIVE' && (
                          <Tooltip content="الموافقة على المتجر">
                            <Button variant="ghost" size="icon" className="h-9 w-9"
                              aria-label={`الموافقة على متجر ${store.name}`}
                              disabled={pendingId === store.id}
                              onClick={() => onUpdateStatus(store.id, 'ACTIVE')}>
                              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                            </Button>
                          </Tooltip>
                        )}
                        {store.status === 'BLOCKED' ? (
                          <Tooltip content="رفع الحظر">
                            <Button variant="ghost" size="icon" className="h-9 w-9"
                              aria-label={`رفع الحظر عن متجر ${store.name}`}
                              disabled={pendingId === store.id}
                              onClick={() => onUpdateStatus(store.id, 'PENDING')}>
                              <RotateCcw className="h-3.5 w-3.5 text-success" />
                            </Button>
                          </Tooltip>
                        ) : (
                          <Tooltip content="حظر المتجر">
                            <Button variant="ghost" size="icon" className="h-9 w-9"
                              aria-label={`حظر متجر ${store.name}`}
                              disabled={pendingId === store.id}
                              onClick={() => onBlock(store.id, store.name)}>
                              <Ban className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          </Tooltip>
                        )}
                        {/* FIX BUG-02: StorePlan.FEATURED was unreachable
                            — no admin control existed to ever set it. */}
                        <Tooltip content={store.plan === 'FEATURED' ? 'إلغاء تمييز المتجر' : 'تمييز المتجر'}>
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            aria-label={store.plan === 'FEATURED' ? `إلغاء تمييز متجر ${store.name}` : `تمييز متجر ${store.name}`}
                            disabled={pendingId === store.id}
                            onClick={() => onUpdatePlan(store.id, store.plan === 'FEATURED' ? 'FREE' : 'FEATURED')}>
                            <Star className={`h-3.5 w-3.5 ${store.plan === 'FEATURED' ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />
                          </Button>
                        </Tooltip>
                      </div>
                    </td>
                  </tr>
                );
});
