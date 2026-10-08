import { FollowTargetType, StoryVisibility } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { uploadImage, deleteMedia } from '../../config/cloudinary';
import { storiesRepository } from './stories.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { followsService } from '../follows/follows.service';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_STORIES = 20;

const userSummary = { id: true, name: true, avatarUrl: true } as const;

async function canView(story: { userId: string; visibility: StoryVisibility }, viewerId: string | null) {
  if (story.visibility === StoryVisibility.PUBLIC) return true;
  if (!viewerId) return false;
  if (story.userId === viewerId) return true;
  return followsService.status(viewerId, FollowTargetType.USER, story.userId);
}

function shapeStory(story: any, viewerId: string) {
  return {
    id: story.id,
    userId: story.userId,
    user: story.user,
    mediaUrl: story.mediaUrl,
    text: story.text,
    background: story.background,
    visibility: story.visibility,
    createdAt: story.createdAt,
    expiresAt: story.expiresAt,
    viewCount: story._count?.views ?? 0,
    viewed: story.views?.length ? true : false,
    isOwner: story.userId === viewerId,
  };
}

export const storiesService = {
  create: async (userId: string, input: { text?: string; background?: string; visibility: StoryVisibility }, file?: Express.Multer.File) => {
    const text = input.text?.trim() || null;
    if (!file && !text) throw new BadRequestError('Story must contain an image or text', 'STORY_CONTENT_REQUIRED');

    const activeCount = await prisma.story.count({ where: { userId, expiresAt: { gt: new Date() } } });
    if (activeCount >= MAX_ACTIVE_STORIES) throw new BadRequestError(`You can have at most ${MAX_ACTIVE_STORIES} active stories`, 'STORY_LIMIT_REACHED');

    let uploaded: { url: string; publicId: string } | null = null;
    try {
      if (file) uploaded = await uploadImage(file.buffer, 'stories');
      const story = await storiesRepository.create({
        user: { connect: { id: userId } },
        mediaUrl: uploaded?.url,
        mediaPublicId: uploaded?.publicId,
        text,
        background: input.background?.trim() || null,
        visibility: input.visibility,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      });
      const full = await prisma.story.findUnique({ where: { id: story.id }, include: { user: { select: userSummary }, _count: { select: { views: true } } } });
      return shapeStory(full, userId);
    } catch (error) {
      if (uploaded?.publicId) void deleteMedia(uploaded.publicId).catch(() => {});
      throw error;
    }
  },

  feed: async (userId: string) => {
    const followed = await followsService.getFollowedTargetIds(userId, FollowTargetType.USER);
    const userIds = Array.from(new Set([userId, ...followed]));
    const rows = await storiesRepository.listActiveForUsers(userIds);
    const viewed = await prisma.storyView.findMany({ where: { viewerId: userId, storyId: { in: rows.map((r) => r.id) } }, select: { storyId: true } });
    const viewedIds = new Set(viewed.map((v) => v.storyId));
    const stories = rows.filter((story) => story.userId === userId || story.visibility === StoryVisibility.PUBLIC || followed.includes(story.userId));
    const groups = new Map<string, any>();
    for (const story of stories) {
      const current = groups.get(story.userId) ?? { user: story.user, stories: [], hasUnseen: false, latestCreatedAt: story.createdAt };
      const shaped = shapeStory({ ...story, views: viewedIds.has(story.id) ? [{}] : [] }, userId);
      current.stories.push(shaped);
      if (!viewedIds.has(story.id) && story.userId !== userId) current.hasUnseen = true;
      if (story.createdAt > current.latestCreatedAt) current.latestCreatedAt = story.createdAt;
      groups.set(story.userId, current);
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.user.id === userId) return -1;
      if (b.user.id === userId) return 1;
      if (a.hasUnseen !== b.hasUnseen) return a.hasUnseen ? -1 : 1;
      return new Date(b.latestCreatedAt).getTime() - new Date(a.latestCreatedAt).getTime();
    });
  },

  userStories: async (viewerId: string | null, userId: string) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, isActive: true } });
    if (!user?.isActive) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    const rows = await storiesRepository.listActiveForUser(userId);
    const visible: any[] = [];
    for (const story of rows) {
      if (await canView(story, viewerId)) visible.push(story);
    }
    if (!viewerId) return visible.map((story) => shapeStory({ ...story, views: [] }, ''));
    const viewed = await prisma.storyView.findMany({ where: { viewerId, storyId: { in: visible.map((r) => r.id) } }, select: { storyId: true } });
    const viewedIds = new Set(viewed.map((v) => v.storyId));
    return visible.map((story) => shapeStory({ ...story, views: viewedIds.has(story.id) ? [{}] : [] }, viewerId));
  },

  view: async (viewerId: string, storyId: string) => {
    const story = await storiesRepository.findActiveById(storyId);
    if (!story) throw new NotFoundError('Story not found or expired', 'STORY_NOT_FOUND');
    if (!(await canView(story, viewerId))) throw new ForbiddenError('You cannot view this story', 'STORY_NOT_VISIBLE');
    await storiesRepository.createView(storyId, viewerId);
    return { storyId, viewed: true };
  },

  delete: async (userId: string, storyId: string) => {
    const story = await storiesRepository.findById(storyId);
    if (!story || story.userId !== userId) throw new NotFoundError('Story not found', 'STORY_NOT_FOUND');
    const result = await storiesRepository.delete(storyId, userId);
    if (!result.count) throw new NotFoundError('Story not found', 'STORY_NOT_FOUND');
    if (story.mediaPublicId) void deleteMedia(story.mediaPublicId).catch(() => {});
  },

  viewers: async (userId: string, storyId: string) => {
    const story = await storiesRepository.findById(storyId);
    if (!story || story.userId !== userId) throw new NotFoundError('Story not found', 'STORY_NOT_FOUND');
    return storiesRepository.listViewers(storyId);
  },
};
