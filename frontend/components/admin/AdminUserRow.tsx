'use client';
import { memo } from 'react';
import { ShieldOff, ShieldCheck, ChevronDown, Crown, ShieldAlert, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Checkbox } from '@/components/shared/ui/Checkbox';
import { Tooltip } from '@/components/shared/ui/Tooltip';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/shared/ui/DropdownMenu';
import type { AdminUser, AssignableRole } from '@/types/admin.types';
import { formatDate } from '@/lib/formatters';
import type { UserRole } from '@/types/auth.types';
import { USER_ACTIVE_STATUS_VARIANT, USER_ACTIVE_STATUS_LABELS, userActiveKey } from '@/lib/userActiveStatus';
import { cn } from '@/lib/utils';

const ROLE_RANK: Record<UserRole, number> = { USER: 0, MODERATOR: 1, ADMIN: 2, SUPER_ADMIN: 3 };
const ASSIGNABLE_ROLES: AssignableRole[] = ['USER', 'MODERATOR', 'ADMIN'];
const ROLE_BADGE: Record<UserRole, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'warning'; className?: string }> = {
  USER: { label: 'مستخدم', variant: 'secondary' }, MODERATOR: { label: 'مشرف مساعد', variant: 'outline', className: 'border-primary text-primary' }, ADMIN: { label: 'مدير', variant: 'default' }, SUPER_ADMIN: { label: 'مدير أعلى', variant: 'warning' },
};
const ROLE_ICON: Record<AssignableRole, typeof UserIcon> = { USER: UserIcon, MODERATOR: ShieldAlert, ADMIN: Crown };
function canManageRole(actorRole: UserRole, current: UserRole, next: UserRole) { return ROLE_RANK[actorRole] >= ROLE_RANK.ADMIN && ROLE_RANK[current] < ROLE_RANK[actorRole] && ROLE_RANK[next] < ROLE_RANK[actorRole]; }

type RoleTarget = { id: string; currentRole: UserRole; nextRole: AssignableRole; name: string };
type Props = { user: AdminUser; selected: boolean; actorRole: UserRole; pendingStatusUserId?: string; pendingRoleUserId?: string; onToggle: (id: string) => void; onToggleStatus: (id: string, active: boolean) => void; onRoleTarget: (target: RoleTarget) => void; };

export const AdminUserRow = memo(function AdminUserRow({ user, selected, actorRole, pendingStatusUserId, pendingRoleUserId, onToggle, onToggleStatus, onRoleTarget }: Props) {
  const userRole = user.role as UserRole;
  const badge = ROLE_BADGE[userRole];
  const isTargetSuperAdmin = userRole === 'SUPER_ADMIN';
  const canManageStatus = !isTargetSuperAdmin && canManageRole(actorRole, userRole, userRole);
  const canManageAnyRole = !isTargetSuperAdmin && ASSIGNABLE_ROLES.some((r) => r !== userRole && canManageRole(actorRole, userRole, r));
  return (
<tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      {canManageStatus && (
                        <Checkbox
                          checked={selected}
                          onChange={() => onToggle(user.id)}
                          aria-label={`تحديد ${user.name}`}
                        />
                      )}
                    </td>
                    <td className="p-3">
                      <span className="font-medium">{user.name}</span>
                    </td>
                    <td className="p-3 hidden md:table-cell text-muted-foreground">{user.email}</td>
                    <td className="p-3">
                      <Badge variant={badge.variant} className={cn('text-xs', badge.className)}>
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="p-3 hidden sm:table-cell">
                      <Badge variant={USER_ACTIVE_STATUS_VARIANT[userActiveKey(user.isActive)]} className="text-xs">
                        {USER_ACTIVE_STATUS_LABELS[userActiveKey(user.isActive)]}
                      </Badge>
                    </td>
                    <td className="p-3 hidden lg:table-cell text-muted-foreground text-xs">{formatDate(user.createdAt)}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        {/* DESKTOP-AUDIT-01: title= → Tooltip, same
                            content this button already computed for its
                            (unstyled, inconsistent-across-browsers)
                            native title — aria-label untouched, it's the
                            real accessible name for screen readers. */}
                        <Tooltip
                          content={
                            isTargetSuperAdmin
                              ? 'لا يمكن تعديل حساب مدير أعلى'
                              : !canManageStatus
                                ? 'لا تملك صلاحية تعديل هذا الحساب'
                                : (user.isActive ? 'إيقاف' : 'تفعيل')
                          }
                        >
                          <Button variant="ghost" size="icon" className="h-9 w-9"
                            aria-label={user.isActive ? `إيقاف ${user.name}` : `تفعيل ${user.name}`}
                            disabled={!canManageStatus || pendingStatusUserId === user.id}
                            onClick={() => onToggleStatus(user.id, !user.isActive)}>
                            {user.isActive
                              ? <ShieldOff className="h-3.5 w-3.5 text-destructive" />
                              : <ShieldCheck className="h-3.5 w-3.5 text-success" />}
                          </Button>
                        </Tooltip>

                        {/* FIX AUDIT-V3-05 / Gap #20: role menu — replaces
                            the old two-way USER<->ADMIN toggle now that
                            there are four ranked roles. Each option is
                            individually enabled/disabled based on
                            canManageRole, mirroring the backend's own
                            per-request check exactly. */}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-9 gap-1 px-2"
                              title={
                                isTargetSuperAdmin
                                  ? 'لا يمكن تعديل دور مدير أعلى'
                                  : !canManageAnyRole
                                    ? 'لا تملك صلاحية تغيير هذا الدور'
                                    : 'تغيير الدور'
                              }
                              aria-label={`تغيير دور ${user.name}`}
                              disabled={!canManageAnyRole || pendingRoleUserId === user.id}>
                              <span className="sr-only sm:not-sr-only sm:text-xs">تغيير الدور</span>
                              <ChevronDown className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48">
                            <DropdownMenuLabel className="text-xs text-muted-foreground">تعيين كـ</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {ASSIGNABLE_ROLES.map((candidateRole) => {
                              const Icon = ROLE_ICON[candidateRole];
                              const isCurrent = candidateRole === userRole;
                              const allowed = !isCurrent && canManageRole(actorRole, userRole, candidateRole);
                              return (
                                <DropdownMenuItem
                                  key={candidateRole}
                                  disabled={isCurrent || !allowed}
                                  onSelect={() => onRoleTarget({
                                    id: user.id,
                                    currentRole: userRole,
                                    nextRole: candidateRole,
                                    name: user.name,
                                  })}
                                >
                                  <Icon className="h-3.5 w-3.5 me-2" />
                                  {ROLE_BADGE[candidateRole].label}
                                  {isCurrent && <span className="text-xs text-muted-foreground ms-auto">(الحالي)</span>}
                                </DropdownMenuItem>
                              );
                            })}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </td>
                  </tr>
                );
});
