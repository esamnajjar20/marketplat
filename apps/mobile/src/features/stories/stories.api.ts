import { apiRequest } from '@/api/client';

type Envelope<T> = { success: boolean; message?: string; data?: T };
export type Story = {
  id: string; userId: string; user: { id: string; name: string; avatarUrl?: string | null };
  mediaUrl?: string | null; text?: string | null; background?: string | null;
  visibility: 'PUBLIC' | 'FOLLOWERS'; createdAt: string; expiresAt: string;
  viewCount: number; viewed: boolean; isOwner: boolean;
};
export type StoryGroup = { user: Story['user']; stories: Story[]; hasUnseen: boolean; latestCreatedAt: string };
function unwrap<T>(response: Envelope<T>, fallback: string): T {
  if (response?.success !== true || response.data === undefined) throw new Error(response?.message || fallback);
  return response.data;
}
export async function fetchStoryFeed(token: string): Promise<StoryGroup[]> {
  const data = unwrap(await apiRequest<Envelope<StoryGroup[]>>('/api/v1/stories/feed', { token }), 'تعذر تحميل القصص.');
  return Array.isArray(data) ? data : [];
}
export async function fetchUserStories(userId: string, token?: string | null): Promise<Story[]> {
  const data = unwrap(await apiRequest<Envelope<Story[]>>(`/api/v1/stories/user/${encodeURIComponent(userId)}`, token ? { token } : {}), 'تعذر تحميل قصص المستخدم.');
  return Array.isArray(data) ? data : [];
}
export async function createStory(input: { text?: string; visibility: 'PUBLIC' | 'FOLLOWERS'; background?: string }, asset: { uri: string; fileName?: string | null; mimeType?: string | null } | null, token: string, csrfToken?: string | null): Promise<Story> {
  if (!input.text?.trim() && !asset) throw new Error('أضف نصًا أو صورة للقصة.');
  const form = new FormData();
  if (input.text?.trim()) form.append('text', input.text.trim());
  form.append('visibility', input.visibility);
  if (input.background) form.append('background', input.background);
  if (asset) form.append('image', { uri: asset.uri, name: asset.fileName || `story-${Date.now()}.jpg`, type: asset.mimeType || 'image/jpeg' } as unknown as Blob);
  return unwrap(await apiRequest<Envelope<Story>>('/api/v1/stories', { method: 'POST', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined, body: form }), 'تعذر نشر القصة.');
}
export async function markStoryViewed(storyId: string, token: string): Promise<void> {
  unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/stories/${encodeURIComponent(storyId)}/view`, { method: 'POST', token, body: JSON.stringify({}) }), 'تعذر تسجيل مشاهدة القصة.');
}
export async function deleteStory(storyId: string, token: string, csrfToken?: string | null): Promise<void> {
  unwrap(await apiRequest<Envelope<unknown>>(`/api/v1/stories/${encodeURIComponent(storyId)}`, { method: 'DELETE', token, headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined }), 'تعذر حذف القصة.');
}
