import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma, StoryVisibility } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { storiesRepository } from '../../src/modules/engagement/stories/stories.repository';
import { storiesService } from '../../src/modules/engagement/stories/stories.service';
import { followsService } from '../../src/modules/engagement/follows/follows.service';
import { blockedUsersService } from '../../src/modules/trust/blocked-users/blocked-users.service';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { uploadImage } from '../../src/config/cloudinary';
import { deleteCloudinaryAsset } from '../../src/shared/media/cloudinaryHelpers';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    storyView: { findMany: jest.fn() },
    userBlock: { findMany: jest.fn() },
    story: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('../../src/modules/engagement/stories/stories.repository', () => ({
  storiesRepository: {
    listActiveForUser: jest.fn(),
    listActiveAuthorIdsForFeed: jest.fn(),
    listActiveForUsers: jest.fn(),
    findActiveById: jest.fn(),
    createView: jest.fn(),
  },
}));
jest.mock('../../src/modules/engagement/follows/follows.service', () => ({
  followsService: { status: jest.fn(), getFollowedTargetIds: jest.fn() },
}));
jest.mock('../../src/modules/trust/blocked-users/blocked-users.service', () => ({
  blockedUsersService: { isBlockedEitherDirection: jest.fn() },
}));
jest.mock('../../src/config/cloudinary', () => ({ uploadImage: jest.fn() }));
jest.mock('../../src/shared/media/cloudinaryHelpers', () => ({
  deleteCloudinaryAsset: jest.fn().mockResolvedValue(undefined),
}));

const story = (id: string, visibility: StoryVisibility) => ({
  id,
  userId: 'author-1',
  user: { id: 'author-1', name: 'Author', avatarUrl: null },
  mediaUrl: null,
  text: 'Story',
  background: null,
  visibility,
  createdAt: new Date('2026-11-24T10:00:00.000Z'),
  expiresAt: new Date('2026-11-25T10:00:00.000Z'),
  _count: { views: 0 },
});

describe('storiesService block-aware visibility', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (followsService.getFollowedTargetIds as jest.Mock).mockResolvedValue(['author-1']);
    (storiesRepository.listActiveAuthorIdsForFeed as jest.Mock).mockResolvedValue(['viewer-1', 'author-1']);
    (storiesRepository.listActiveForUsers as jest.Mock).mockResolvedValue([]);
    (prisma.userBlock.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.storyView.findMany as jest.Mock).mockResolvedValue([]);
  });

  it('hides follower-only stories when either user blocked the other, but keeps public stories public', async () => {
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 'author-1', isActive: true });
    (prisma.storyView.findMany as jest.Mock).mockResolvedValue([]);
    (storiesRepository.listActiveForUser as jest.Mock).mockResolvedValue([
      story('public-1', StoryVisibility.PUBLIC),
      story('followers-1', StoryVisibility.FOLLOWERS),
    ]);
    (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

    const result = await storiesService.userStories('viewer-1', 'author-1');

    expect(result.map((item) => item.id)).toEqual(['public-1']);
    expect(followsService.status).not.toHaveBeenCalled();
  });



  it('does not load blocked authors from the stories feed even when an old follow remains', async () => {
    (storiesRepository.listActiveAuthorIdsForFeed as jest.Mock).mockResolvedValue(['viewer-1']);
    (storiesRepository.listActiveForUsers as jest.Mock).mockResolvedValue([]);

    const result = await storiesService.feed('viewer-1');

    expect(storiesRepository.listActiveAuthorIdsForFeed).toHaveBeenCalledWith('viewer-1', 50);
    expect(storiesRepository.listActiveForUsers).toHaveBeenCalledWith(['viewer-1'], 20);
    expect(result).toHaveLength(0);
  });

  it('resolves follow eligibility and either-way blocks inside the bounded SQL query', () => {
    const repository = readFileSync(join(__dirname, '../../src/modules/engagement/stories/stories.repository.ts'), 'utf8');
    expect(repository).toContain('FROM "follows" AS follow');
    expect(repository).toContain('INNER JOIN "stories" AS story');
    expect(repository).toContain('FROM "user_blocks" AS block');
    expect(repository).toContain('OR NOT EXISTS');
    expect(repository).toContain('LIMIT ${safeLimit}');
    expect(repository).toContain('Math.min(50, Math.trunc(limit || 50))');
  });

  it('caps a stories feed at 50 authors and 20 stories per author', async () => {
    (storiesRepository.listActiveAuthorIdsForFeed as jest.Mock).mockResolvedValue(['viewer-1', 'author-1']);
    (storiesRepository.listActiveForUsers as jest.Mock).mockResolvedValue([]);

    await storiesService.feed('viewer-1');

    expect(storiesRepository.listActiveAuthorIdsForFeed).toHaveBeenCalledWith('viewer-1', 50);
    expect(storiesRepository.listActiveForUsers).toHaveBeenCalledWith(['viewer-1', 'author-1'], 20);
  });

  it('rejects direct access to a follower-only story after a block even when a follow row remains', async () => {
    (storiesRepository.findActiveById as jest.Mock).mockResolvedValue(
      story('followers-1', StoryVisibility.FOLLOWERS),
    );
    (blockedUsersService.isBlockedEitherDirection as jest.Mock).mockResolvedValue(true);

    await expect(storiesService.view('viewer-1', 'followers-1')).rejects.toThrow(ForbiddenError);
    expect(followsService.status).not.toHaveBeenCalled();
    expect(storiesRepository.createView).not.toHaveBeenCalled();
  });


  it('checks the active-story limit inside a serializable transaction and cleans up an upload when full', async () => {
    const file = { buffer: Buffer.from('image') } as Express.Multer.File;
    const tx = {
      story: {
        count: jest.fn().mockResolvedValue(20),
        create: jest.fn(),
      },
    };
    (uploadImage as jest.Mock).mockResolvedValue({ url: 'https://media.example/story.jpg', publicId: 'stories/story-1' });
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback: (client: typeof tx) => unknown, options: unknown) => {
      expect(options).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return callback(tx);
    });

    await expect(storiesService.create('author-1', { visibility: StoryVisibility.PUBLIC }, file)).rejects.toThrow(BadRequestError);

    expect(tx.story.count).toHaveBeenCalledWith({
      where: { userId: 'author-1', expiresAt: { gt: expect.any(Date) } },
    });
    expect(tx.story.create).not.toHaveBeenCalled();
    expect(deleteCloudinaryAsset).toHaveBeenCalledWith('stories/story-1', 'image');
  });

  it('continues to allow a public story despite a block, per visibility policy', async () => {
    (storiesRepository.findActiveById as jest.Mock).mockResolvedValue(
      story('public-1', StoryVisibility.PUBLIC),
    );
    (storiesRepository.createView as jest.Mock).mockResolvedValue({ id: 'view-1' });

    await expect(storiesService.view('viewer-1', 'public-1')).resolves.toEqual({
      storyId: 'public-1',
      viewed: true,
    });
    expect(blockedUsersService.isBlockedEitherDirection).not.toHaveBeenCalled();
    expect(storiesRepository.createView).toHaveBeenCalledWith('public-1', 'viewer-1');
  });
});
