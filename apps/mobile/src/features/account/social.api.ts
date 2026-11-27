import type { ApiEnvelope as SharedApiEnvelope, ApiPaginationMeta } from '@/api/contracts';
import { apiRequest } from '@/api/client';
import { buildFilterParams } from '../../../../../shared/filters';
import type { ReportReason } from '@marketplat/contracts';
export type { ReportReason } from '@marketplat/contracts';

type Envelope<T> = SharedApiEnvelope<T>;
export type PaginationMeta = ApiPaginationMeta;
export type PublicUser = {
  id: string; name?: string | null; city?: string | null; bio?: string | null; avatarUrl?: string | null;
  createdAt?: string; _count?: { ads?: number };
  followStats?: { followers?: number; following?: number };
  sellerProfile?: {
    id?: string; displayName?: string | null; verified?: boolean; averageRating?: number | null; totalRatings?: number; suspended?: boolean;
    _count?: { serviceReviews?: number };
    storeDetails?: { id: string; name?: string | null; description?: string | null; logoUrl?: string | null; coverImageUrl?: string | null; city?: string | null; plan?: string | null; phone?: string | null; _count?: { followers?: number; products?: number } } | null;
    serviceProviderDetails?: { id: string; businessName?: string | null; businessType?: string | null; logoUrl?: string | null; description?: string | null; serviceAreaCities?: string[]; availabilityStatus?: string; completedRequestsCount?: number } | null;
  } | null;
};
export type PublicAd = { id: string; title: string; price: number | string | null; images?: string[]; city?: string; createdAt?: string };
export type FollowListItem = { id: string; targetType: string; targetId: string; target?: { id: string; name?: string | null; avatarUrl?: string | null; city?: string | null } | null; follower?: { id: string; name?: string | null; avatarUrl?: string | null; city?: string | null } | null };
export type BlockedUserItem = { id: string; blockedId: string; createdAt?: string; blocked?: { id: string; name?: string | null; avatarUrl?: string | null } | null };

function unwrap<T>(response: Envelope<T>, fallback: string): T {
  if (!response || response.success !== true || response.data === undefined) throw new Error(response?.message || fallback);
  return response.data;
}

export async function fetchPublicUser(id: string): Promise<PublicUser> {
  const response = await apiRequest<Envelope<PublicUser>>(`/api/v1/users/${encodeURIComponent(id)}`);
  return unwrap(response, 'تعذر تحميل الملف العام للمستخدم.');
}
export async function fetchPublicUserAds(id: string, page = 1, limit = 12): Promise<{ items: PublicAd[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<PublicAd[]>>(`/api/v1/users/${encodeURIComponent(id)}/ads?${buildFilterParams({ page, limit }, { profile: 'publicProfileAds' })}`);
  const items = unwrap(response, 'تعذر تحميل إعلانات المستخدم.');
  if (!Array.isArray(items)) throw new Error('استجابة إعلانات المستخدم غير صالحة.');
  return { items, meta: response.meta?.pagination };
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

export type FollowingFeedItem = {
  type: 'AD' | 'PRODUCT' | 'SERVICE';
  id: string;
  title: string;
  price?: number | string | null;
  images?: string[];
  city?: string | null;
  createdAt?: string;
  userId?: string | null;
  storeId?: string | null;
  categoryId?: string | null;
};
export async function fetchFollowingFeed(token: string, page = 1, limit = 20, signal?: AbortSignal): Promise<{ items: FollowingFeedItem[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<FollowingFeedItem[]>>(`/api/v1/follows/feed?${buildFilterParams({ page, limit }, { profile: 'followingFeed' })}`, { token, signal });
  const items = unwrap(response, 'تعذر تحميل نشاط الحسابات التي تتابعها.');
  if (!Array.isArray(items)) throw new Error('استجابة موجز المتابعة غير صالحة.');
  return { items, meta: response.meta?.pagination };
}

export async function fetchUserFollowList(id: string, mode: 'followers' | 'following', page = 1, limit = 20, signal?: AbortSignal): Promise<{ items: FollowListItem[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<FollowListItem[]>>(`/api/v1/follows/users/${encodeURIComponent(id)}/${mode}?${buildFilterParams({ page, limit }, { profile: 'followList' })}`, { signal });
  const items = unwrap(response, 'تعذر تحميل القائمة.');
  if (!Array.isArray(items)) throw new Error('استجابة قائمة المتابعة غير صالحة.');
  return { items, meta: response.meta?.pagination };
}
export async function fetchBlockedUsers(token: string, page = 1, limit = 50, signal?: AbortSignal): Promise<{ items: BlockedUserItem[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<BlockedUserItem[]>>(`/api/v1/blocked-users?${buildFilterParams({ page, limit }, { profile: 'blockedUsers' })}`, { token, signal });
  const items = unwrap(response, 'تعذر تحميل قائمة المستخدمين المحظورين.');
  if (!Array.isArray(items)) throw new Error('استجابة المستخدمين المحظورين غير صالحة.');
  return { items, meta: response.meta?.pagination };
}
export async function toggleBlockUser(id: string, token: string, csrfToken?: string | null): Promise<'blocked' | 'unblocked'> {
  const response = await apiRequest<Envelope<{ action: 'blocked' | 'unblocked' }>>(`/api/v1/blocked-users/${encodeURIComponent(id)}`, {
    method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
  });
  return unwrap(response, 'تعذر تحديث الحظر.').action;
}
export async function unblockUser(id: string, token: string, csrfToken?: string | null): Promise<void> {
  const response = await apiRequest<Envelope<unknown>>(`/api/v1/blocked-users/${encodeURIComponent(id)}`, { method: 'DELETE', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: JSON.stringify({}) });
  if (!response || response.success !== true) throw new Error(response?.message || 'تعذر إلغاء الحظر.');
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
export async function fetchMyReports(token: string, page = 1, limit = 20, signal?: AbortSignal): Promise<{ items: MyReport[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<MyReport[]>>(`/api/v1/reports/me?${buildFilterParams({ page, limit }, { profile: 'myReports' })}`, { token, signal });
  const items = unwrap(response, 'تعذر تحميل بلاغاتك.');
  if (!Array.isArray(items)) throw new Error('استجابة بلاغاتك غير صالحة.');
  return { items, meta: response.meta?.pagination };
}

/** One authenticated request for all viewer-specific public-profile controls. */
export type ProfileInteractionState = {
  following: boolean;
  online: boolean;
  lastSeenAt: string | null;
  isBlockedByMe: boolean;
  interactionRestricted: boolean;
};
export async function fetchProfileInteractionState(id: string, token: string): Promise<ProfileInteractionState> {
  const response = await apiRequest<Envelope<ProfileInteractionState>>(`/api/v1/users/${encodeURIComponent(id)}/profile-state`, { token });
  return unwrap(response, 'تعذر التحقق من حالة الملف الشخصي.');
}

export type PublicSellerRating = {
  id: string;
  score: number;
  comment?: string | null;
  createdAt: string;
  rater?: { id?: string; name?: string | null; avatarUrl?: string | null } | null;
  ad?: { id?: string; title?: string | null } | null;
};
export async function fetchSellerRatings(id: string, page = 1, limit = 10): Promise<{ items: PublicSellerRating[]; meta?: PaginationMeta }> {
  const response = await apiRequest<Envelope<PublicSellerRating[]>>(`/api/v1/sellers/${encodeURIComponent(id)}/ratings?${buildFilterParams({ page, limit }, { profile: 'sellerRatings' })}`);
  const items = unwrap(response, 'تعذر تحميل تقييمات البائع.');
  if (!Array.isArray(items)) throw new Error('استجابة تقييمات البائع غير صالحة.');
  return { items, meta: response.meta?.pagination };
}
