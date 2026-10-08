import { apiClient } from './client';
import type { ApiResponse } from '@/types/api.types';

export type StoryVisibility = 'PUBLIC' | 'FOLLOWERS';
export interface StoryUser { id: string; name: string; avatarUrl: string | null; }
export interface StoryItem {
  id: string;
  userId: string;
  user: StoryUser;
  mediaUrl: string | null;
  text: string | null;
  background: string | null;
  visibility: StoryVisibility;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  viewed: boolean;
  isOwner: boolean;
}
export interface StoryGroup { user: StoryUser; stories: StoryItem[]; hasUnseen: boolean; latestCreatedAt: string; }
export interface StoryViewer { viewer: StoryUser; viewedAt: string; }

export const storiesApi = {
  feed: () => apiClient.get<ApiResponse<StoryGroup[]>>('/stories/feed'),
  userStories: (userId: string) => apiClient.get<ApiResponse<StoryItem[]>>(`/stories/user/${userId}`),
  create: (input: { file?: File; text?: string; background?: string; visibility: StoryVisibility }) => {
    const form = new FormData();
    if (input.file) form.append('image', input.file);
    if (input.text) form.append('text', input.text);
    if (input.background) form.append('background', input.background);
    form.append('visibility', input.visibility);
    return apiClient.post<ApiResponse<StoryItem>>('/stories', form, { timeout: 30_000 });
  },
  view: (storyId: string) => apiClient.post<ApiResponse<{ storyId: string; viewed: boolean }>>(`/stories/${storyId}/view`),
  remove: (storyId: string) => apiClient.delete<ApiResponse<null>>(`/stories/${storyId}`),
  viewers: (storyId: string) => apiClient.get<ApiResponse<StoryViewer[]>>(`/stories/${storyId}/viewers`),
};
