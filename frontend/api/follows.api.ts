import { apiClient } from './client';
import { unwrapPaginated } from '@/lib/apiPagination';
import type { ApiResponse } from '@/types/api.types';

export type FollowTargetType = 'USER' | 'STORE' | 'CATEGORY';
export interface FollowPerson { id: string; name: string; avatarUrl: string | null; city: string | null; }
export interface FollowStore { id: string; name: string; logoUrl: string | null; city: string; }
export interface FollowCategory { id: string; name: string; nameAr: string; slug: string; categoryType: 'AD' | 'PRODUCT' | 'SERVICE'; }
export interface FollowItem { id: string; followerId: string; targetType: FollowTargetType; targetId: string; createdAt: string; target?: FollowPerson | FollowStore | FollowCategory | null; follower?: FollowPerson | null; }
export interface ToggleFollowResult { action: 'followed' | 'unfollowed'; targetType: FollowTargetType; targetId: string; }
export interface FollowingFeedItem {
  type: 'AD' | 'PRODUCT' | 'SERVICE';
  id: string;
  title: string;
  price: string | number | null;
  images: string[];
  city: string | null;
  createdAt: string;
  userId: string | null;
  storeId: string | null;
  categoryId: string | null;
}

export const followsApi = {
  toggle: (targetType: FollowTargetType, targetId: string) =>
    apiClient.post<ApiResponse<ToggleFollowResult>>('/follows', { targetType, targetId }),
  status: (targetType: FollowTargetType, targetId: string) =>
    apiClient.get<ApiResponse<{ following: boolean }>>(`/follows/status/${targetType}/${targetId}`),
  myFollowing: (params?: { type?: FollowTargetType; page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<FollowItem[]>>('/follows/me', { params }).then((r) => unwrapPaginated<FollowItem>(r)),
  userFollowers: (id: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<FollowItem[]>>(`/follows/users/${id}/followers`, { params }).then((r) => unwrapPaginated<FollowItem>(r)),
  userFollowing: (id: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<FollowItem[]>>(`/follows/users/${id}/following`, { params }).then((r) => unwrapPaginated<FollowItem>(r)),
  targetFollowers: (targetType: FollowTargetType, targetId: string, params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<FollowItem[]>>(`/follows/target/${targetType}/${targetId}/followers`, { params }).then((r) => unwrapPaginated<FollowItem>(r)),
  feed: (params?: { page?: number; limit?: number }) =>
    apiClient.get<ApiResponse<FollowingFeedItem[]>>('/follows/feed', { params }).then((r) => unwrapPaginated<FollowingFeedItem>(r)),
};
