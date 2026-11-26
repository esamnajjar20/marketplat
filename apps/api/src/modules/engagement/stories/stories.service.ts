import { FollowTargetType, Prisma, StoryVisibility } from '@prisma/client';
import { prisma } from '../../../config/prisma';
import { uploadImage } from '../../../config/cloudinary';
import { storiesRepository } from './stories.repository';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../../shared/errors/BadRequestError';
import { followsService } from '../follows/follows.service';
import { deleteCloudinaryAsset } from '../../../shared/media/cloudinaryHelpers';
import { blockedUsersService } from '../../trust/blocked-users/blocked-users.service';
import { isPrismaError } from '../../../shared/db/prismaErrors';

const STORY_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ACTIVE_STORIES = 20;

const userSummary = { id: true, name: true, avatarUrl: true } as const;

async function canView(
  story: { userId: string; visibility: StoryVisibility },
  viewerId: string | null
) {
  // PUBLIC visibility remains public by product policy. Blocks restrict
  // follower-only content and interactions, not explicitly public stories.
  if (story.visibility === StoryVisibility.PUBLIC) return true;
  if (!viewerId) return false;
  if (story.userId === viewerId) return true;
  if (await blockedUsersService.isBlockedEitherDirection(viewerId, story.userId)) return false;
  return followsService.status(viewerId, FollowTargetType.USER, story.userId);
}

async function createStoryWithinUserLimit(userId: string, data: Prisma.StoryCreateInput) {
  // A count-then-create check at READ COMMITTED can be passed by two
  // concurrent requests. SERIALIZABLE makes the predicate read part of
  // the transaction's conflict detection; retry serialization conflicts
  // so the loser observes the committed count and receives the limit error.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(
        async tx => {
          const activeCount = await tx.story.count({
            where: { userId, expiresAt: { gt: new Date() } },
          });
          if (activeCount >= MAX_ACTIVE_STORIES) {
            throw new BadRequestError(
              `You can have at most ${MAX_ACTIVE_STORIES} active stories`,
              'STORY_LIMIT_REACHED'
            );
          }
          return tx.story.create({ data });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (error) {
      if (isPrismaError(error, 'P2034') && attempt < 2) continue;
      throw error;
    }
  }
  throw new BadRequestError('Unable to reserve a story slot. Please retry.', 'STORY_LIMIT_RETRY');
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
  create: async (
    userId: string,
    input: { text?: string; background?: string; visibility: StoryVisibility },
    file?: Express.Multer.File
  ) => {
    const text = input.text?.trim() || null;
    if (!file && !text)
      throw new BadRequestError('Story must contain an image or text', 'STORY_CONTENT_REQUIRED');

    let uploaded: { url: string; publicId: string } | null = null;
    let storyPersisted = false;
    try {
      if (file) uploaded = await uploadImage(file.buffer, 'stories');
      const story = await createStoryWithinUserLimit(userId, {
        user: { connect: { id: userId } },
        mediaUrl: uploaded?.url,
        mediaPublicId: uploaded?.publicId,
        text,
        background: input.background?.trim() || null,
        visibility: input.visibility,
        expiresAt: new Date(Date.now() + STORY_TTL_MS),
      });
      storyPersisted = true;
      const full = await prisma.story.findUnique({
        where: { id: story.id },
        include: { user: { select: userSummary }, _count: { select: { views: true } } },
      });
      return shapeStory(full, userId);
    } catch (error) {
      if (uploaded?.publicId && !storyPersisted)
        await deleteCloudinaryAsset(uploaded.publicId, 'image');
      throw error;
    }
  },

  feed: async (userId: string) => {
    // SQL joins the follow graph to active stories and excludes either-way
    // blocks before selecting the 50 most recently active authors. The app
    // never loads every followed ID or every block row for this feed.
    const feedAuthorIds = await storiesRepository.listActiveAuthorIdsForFeed(userId, 50);
    const rows = await storiesRepository.listActiveForUsers(feedAuthorIds, 20);
    const viewed = await prisma.storyView.findMany({
      where: { viewerId: userId, storyId: { in: rows.map(r => r.id) } },
      select: { storyId: true },
    });
    const viewedIds = new Set(viewed.map(v => v.storyId));
    // The repository has already scoped authors to the viewer and eligible,
    // unblocked follows. Both PUBLIC and FOLLOWERS stories are valid in feed.
    const stories = rows;
    const groups = new Map<string, any>();
    for (const story of stories) {
      const current = groups.get(story.userId) ?? {
        user: story.user,
        stories: [],
        hasUnseen: false,
        latestCreatedAt: story.createdAt,
      };
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, isActive: true, sellerProfile: { select: { suspended: true } } },
    });
    if (!user) throw new NotFoundError('User not found', 'USER_NOT_FOUND');
    if (!user.isActive || user.sellerProfile?.suspended) {
      throw new ForbiddenError('This account is blocked or unavailable.', 'PUBLIC_ACCOUNT_BLOCKED');
    }
    const rows = await storiesRepository.listActiveForUser(userId);
    // Every row belongs to the same author, so the follow relationship is
    // identical for all private stories. Resolve it once instead of issuing
    // one SELECT per story (N+1). Public stories and the owner's own stories
    // remain visible without a follow lookup.
    const interactionBlocked = Boolean(
      viewerId &&
      viewerId !== userId &&
      (await blockedUsersService.isBlockedEitherDirection(viewerId, userId))
    );
    const followsAuthor = Boolean(
      viewerId &&
      viewerId !== userId &&
      !interactionBlocked &&
      (await followsService.status(viewerId, FollowTargetType.USER, userId))
    );
    const visible = rows.filter(
      story =>
        story.visibility === StoryVisibility.PUBLIC || story.userId === viewerId || followsAuthor
    );
    if (!viewerId) return visible.map(story => shapeStory({ ...story, views: [] }, ''));
    const viewed = await prisma.storyView.findMany({
      where: { viewerId, storyId: { in: visible.map(r => r.id) } },
      select: { storyId: true },
    });
    const viewedIds = new Set(viewed.map(v => v.storyId));
    return visible.map(story =>
      shapeStory({ ...story, views: viewedIds.has(story.id) ? [{}] : [] }, viewerId)
    );
  },

  view: async (viewerId: string, storyId: string) => {
    const story = await storiesRepository.findActiveById(storyId);
    if (!story) throw new NotFoundError('Story not found or expired', 'STORY_NOT_FOUND');
    const author = await prisma.user.findUnique({
      where: { id: story.userId },
      select: { isActive: true, sellerProfile: { select: { suspended: true } } },
    });
    if (!author?.isActive || author.sellerProfile?.suspended) {
      throw new ForbiddenError('This account is blocked or unavailable.', 'PUBLIC_ACCOUNT_BLOCKED');
    }
    if (!(await canView(story, viewerId)))
      throw new ForbiddenError('You cannot view this story', 'STORY_NOT_VISIBLE');
    await storiesRepository.createView(storyId, viewerId);
    return { storyId, viewed: true };
  },

  delete: async (userId: string, storyId: string) => {
    const story = await storiesRepository.findById(storyId);
    if (!story || story.userId !== userId)
      throw new NotFoundError('Story not found', 'STORY_NOT_FOUND');
    const result = await storiesRepository.delete(storyId, userId);
    if (!result.count) throw new NotFoundError('Story not found', 'STORY_NOT_FOUND');
    if (story.mediaPublicId) await deleteCloudinaryAsset(story.mediaPublicId, 'image');
  },

  viewers: async (userId: string, storyId: string) => {
    const story = await storiesRepository.findById(storyId);
    if (!story || story.userId !== userId)
      throw new NotFoundError('Story not found', 'STORY_NOT_FOUND');
    return storiesRepository.listViewers(storyId);
  },
};
