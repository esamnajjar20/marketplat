import { apiRequest } from '@/api/client';

type Envelope<T> = { success: boolean; message?: string; data?: T; meta?: { pagination?: PaginationMeta } };
export type PaginationMeta = { page?: number; limit?: number; total?: number; totalPages?: number; hasNextPage?: boolean };
export type PublicUser = {
  id: string; name?: string | null; city?: string | null; bio?: string | null; avatarUrl?: string | null;
  createdAt?: string; _count?: { ads?: number };
  followStats?: { followers?: number; following?: number };
  sellerProfile?: { id?: string; displayName?: string | null; verified?: boolean; averageRating?: number | null; totalRatings?: number; suspended?: boolean; storeDetails?: { id: string; name?: string | null } | null; serviceProviderDetails?: { id: string; businessName?: string | null } | null } | null;
};
export type PublicAd = { id: string; title: string; price: number | string | null; images?: string[]; city?: string; createdAt?: string };
export type FollowListItem = { id: string; targetType: string; targetId: string; target?: { id: string; name?: string | null; avatarUrl?: string | null; city?: string | null } | null; follower?: { id: string; name?: string | null; avatarUrl?: string | null; city?: string | null } | null };
export type BlockedUserItem = { id: string; blockedId: string; createdAt?: string; blocked?: { id: string; name?: string | null; avatarUrl?: string | null } | null };
export type ReportReason = 'SCAM' | 'FAKE' | 'OFFENSIVE' | 'SPAM';

function unwrap<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) throw new Error(response?.message || fallback);
  return response.data;
}

export async function fetchPublicUser(id: string): Promise<PublicUser> {
  const response = await apiRequest<Envelope<PublicUser>>(`/api/v1/users/${encodeURIComponent(id)}`);
  return unwrap(response, 'تعذر تحميل الملف العام للمستخدم.');
}
export async function fetchPublicUserAds(id: string, page = 1, limit = 12): Promise<{ items: PublicAd[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<PublicAd[]>>(`/api/v1/users/${encodeURIComponent(id)}/ads?page=${page}&limit=${limit}`);
  return { items: unwrap(response, 'تعذر تحميل إعلانات المستخدم.'), meta: response.meta?.pagination };
}
export async function fetchFollowStatus(id: string, token: string): Promise<boolean> {
  const response = await apiRequest<Envelope<{ following: boolean }>>(`/api/v1/follows/status/USER/${encodeURIComponent(id)}`, { token });
  return Boolean(unwrap(response, 'تعذر التحقق من حالة المتابعة.').following);
}
export async function toggleUserFollow(id: string, token: string, csrfToken?: string | null): Promise<'followed' | 'unfollowed'> {
  const response = await apiRequest<Envelope<{ action: 'followed' | 'unfollowed' }>>('/api/v1/follows', {
    method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: JSON.stringify({ targetType: 'USER', targetId: id }),
  });
  return unwrap(response, 'تعذر تحديث المتابعة.').action;
}
export async function fetchUserFollowList(id: string, mode: 'followers' | 'following', page = 1, limit = 20): Promise<{ items: FollowListItem[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<FollowListItem[]>>(`/api/v1/follows/users/${encodeURIComponent(id)}/${mode}?page=${page}&limit=${limit}`);
  return { items: unwrap(response, 'تعذر تحميل القائمة.'), meta: response.meta?.pagination };
}
export async function fetchBlockedUsers(token: string, page = 1, limit = 50): Promise<{ items: BlockedUserItem[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<BlockedUserItem[]>>(`/api/v1/blocked-users?page=${page}&limit=${limit}`, { token });
  return { items: unwrap(response, 'تعذر تحميل قائمة المستخدمين المحظورين.'), meta: response.meta?.pagination };
}
export async function toggleBlockUser(id: string, token: string, csrfToken?: string | null): Promise<'blocked' | 'unblocked'> {
  const response = await apiRequest<Envelope<{ action: 'blocked' | 'unblocked' }>>(`/api/v1/blocked-users/${encodeURIComponent(id)}`, {
    method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  return unwrap(response, 'تعذر تحديث الحظر.').action;
}
export async function submitReport(targetType: 'ads' | 'users' | 'stores' | 'products' | 'services', targetId: string, reason: ReportReason, notes: string, token: string, csrfToken?: string | null): Promise<unknown> {
  const path = targetType === 'ads' ? `/api/v1/reports/ads/${encodeURIComponent(targetId)}` : `/api/v1/reports/${targetType}/${encodeURIComponent(targetId)}`;
  const response = await apiRequest<Envelope<unknown>>(path, {
    method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: JSON.stringify({ reason, ...(notes.trim() ? { notes: notes.trim() } : {}) }),
  });
  return unwrap(response, 'تعذر إرسال البلاغ.');
}

export type MyReport = { id: string; targetType?: string; targetId?: string; reason?: string; notes?: string | null; status?: string; createdAt?: string };
export async function fetchMyReports(token: string, page = 1, limit = 20): Promise<{ items: MyReport[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<MyReport[]>>(`/api/v1/reports/me?page=${page}&limit=${limit}`, { token });
  return { items: unwrap(response, 'تعذر تحميل بلاغاتك.'), meta: response.meta?.pagination };
}
