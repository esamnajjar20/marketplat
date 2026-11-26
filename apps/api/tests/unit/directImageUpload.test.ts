import {
  consumeDirectImageUploadIntents,
  createDirectImageUploadIntents,
  resolveDirectImageUploads,
} from '../../src/shared/media/directImageUpload';
import { prisma } from '../../src/config/prisma';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    directUploadIntent: {
      createMany: jest.fn().mockResolvedValue({ count: 2 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn(),
    },
  },
}));
jest.mock('../../src/config/env', () => ({
  env: {
    cloudinary: {
      isConfigured: true,
      cloudName: 'marketplat-test',
      apiKey: 'test-key',
      apiSecret: 'test-secret',
    },
  },
}));
jest.mock('cloudinary', () => ({
  v2: {
    utils: { api_sign_request: jest.fn().mockReturnValue('signed-test-signature') },
    api: { resource: jest.fn() },
  },
}));

describe('direct image upload intent lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it('persists every intent before returning signed parameters', async () => {
    const intents = await createDirectImageUploadIntents('user-1', 'ads', 2);

    expect(intents).toHaveLength(2);
    expect(intents[0]?.publicId).toMatch(/^classifieds\/ads\/mp_[a-f0-9]{24}_[a-f0-9]{32}$/);
    expect(prisma.directUploadIntent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ userId: 'user-1', purpose: 'ads', status: 'PENDING' }),
      ]),
    });
    expect(prisma.directUploadIntent.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('consumes all IDs atomically for the matching owner and purpose', async () => {
    const tx = {
      directUploadIntent: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
    } as any;
    const ids = ['image-a', 'image-b'];

    await expect(consumeDirectImageUploadIntents(tx, 'user-1', 'ads', ids)).resolves.toBeUndefined();
    expect(tx.directUploadIntent.updateMany).toHaveBeenCalledWith({
      where: {
        publicId: { in: ids },
        userId: 'user-1',
        purpose: 'ads',
        status: 'PENDING',
        expiresAt: { gt: expect.any(Date) },
      },
      data: { status: 'CONSUMED', consumedAt: expect.any(Date) },
    });
  });

  it('rejects a partial batch so the enclosing transaction rolls back all status changes', async () => {
    const tx = {
      directUploadIntent: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    } as any;

    await expect(
      consumeDirectImageUploadIntents(tx, 'user-1', 'ads', ['image-a', 'image-b'])
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('rejects duplicate IDs before executing the database update', async () => {
    const tx = { directUploadIntent: { updateMany: jest.fn() } } as any;

    await expect(
      consumeDirectImageUploadIntents(tx, 'user-1', 'ads', ['image-a', 'image-a'])
    ).rejects.toMatchObject({ code: 'DUPLICATE_IMAGE' });
    expect(tx.directUploadIntent.updateMany).not.toHaveBeenCalled();
  });


  it('enforces the five-image request cap in the transactional consumer', async () => {
    const tx = { directUploadIntent: { updateMany: jest.fn() } } as any;
    const sixIds = Array.from({ length: 6 }, (_, index) => `request-image-${index}`);

    await expect(
      consumeDirectImageUploadIntents(tx, 'user-1', 'requests', sixIds)
    ).rejects.toMatchObject({ code: 'DIRECT_UPLOAD_INVALID' });
    expect(tx.directUploadIntent.updateMany).not.toHaveBeenCalled();
  });

  it('requires a persisted owner-and-purpose intent before querying Cloudinary', async () => {
    (prisma.directUploadIntent.findMany as jest.Mock).mockResolvedValue([]);
    const publicId = 'classifieds/ads/mp_111111111111111111111111_22222222222222222222222222222222';

    await expect(resolveDirectImageUploads('user-1', 'ads', [publicId])).rejects.toMatchObject({
      code: 'DIRECT_UPLOAD_ALREADY_CONSUMED',
    });
    expect(require('cloudinary').v2.api.resource).not.toHaveBeenCalled();
    expect(prisma.directUploadIntent.findMany).toHaveBeenCalledWith({
      where: { publicId: { in: [publicId] }, userId: 'user-1', purpose: 'ads' },
      select: { publicId: true },
    });
  });

  it('caps request image intents at five', async () => {
    await expect(createDirectImageUploadIntents('user-1', 'requests', 6)).rejects.toBeInstanceOf(BadRequestError);
    expect(prisma.directUploadIntent.createMany).not.toHaveBeenCalled();
  });
});
