/**
 * `user.isActive ? 'success' : 'destructive'` was written
 * inline in AdminUsersTable — a third one-off instance of the same
 * status→color duplication pattern found on ad/store status (see
 * adStatus.ts / storeStatus.ts). Named here so a future second
 * consumer (e.g. a user-status badge elsewhere) reuses this instead
 * of re-deriving it inline again.
 */
export const USER_ACTIVE_STATUS_VARIANT: Record<'active' | 'inactive', 'success' | 'destructive'> = {
  active:   'success',
  inactive: 'destructive',
};

export const USER_ACTIVE_STATUS_LABELS: Record<'active' | 'inactive', string> = {
  active:   'نشط',
  inactive: 'موقوف',
};

export function userActiveKey(isActive: boolean): 'active' | 'inactive' {
  return isActive ? 'active' : 'inactive';
}
