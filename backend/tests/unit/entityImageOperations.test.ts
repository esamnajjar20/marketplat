import { createEntityImageOperations } from '../../src/shared/utils/entityImageOperations';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/config/cloudinary', () => ({
  uploadImage: jest.fn().mockResolvedValue({ url: 'https://cdn/x.jpg', publicId: 'x' }),
  deleteImage: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../src/shared/utils/cloudinaryHelpers', () => ({
  extractCloudinaryPublicId: jest.fn().mockReturnValue('pub-1'),
  cleanupUploadedImages: jest.fn().mockResolvedValue(undefined),
}));

describe('createEntityImageOperations', () => {
  const entity = {
    id: 'e1',
    status: 'ACTIVE',
    images: ['https://cdn/a.jpg', 'https://cdn/b.jpg'],
  };

  const repository = {
    findById: jest.fn(),
    addImages: jest.fn(),
    removeImage: jest.fn(),
    reorderImages: jest.fn(),
  };

  const withLock = jest.fn(
    async <T>(_id: string, fn: () => Promise<T>): Promise<T> => fn(),
  );

  const ops = createEntityImageOperations({
    repository,
    withLock: withLock as <T>(entityId: string, fn: () => Promise<T>) => Promise<T>,
    uploadFolder: 'products',
    maxImages: 10,
    entityLabel: 'product',
    notFoundCode: 'PRODUCT_NOT_FOUND',
    notOwnedCode: 'PRODUCT_NOT_OWNED',
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository.findById.mockResolvedValue({ ...entity });
    withLock.mockImplementation(async <T>(_id: string, fn: () => Promise<T>) => fn());
  });

  it('addImages throws when entity is missing', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      ops.addImages('e1', () => true, [{ buffer: Buffer.from('x') } as any]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('addImages throws when not owner', async () => {
    await expect(
      ops.addImages('e1', () => false, [{ buffer: Buffer.from('x') } as any]),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('addImages throws when over max images', async () => {
    repository.findById.mockResolvedValue({
      ...entity,
      images: Array.from({ length: 10 }, (_, i) => `https://cdn/${i}.jpg`),
    });
    await expect(
      ops.addImages('e1', () => true, [{ buffer: Buffer.from('x') } as any]),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('addImages uploads and persists under lock', async () => {
    repository.addImages.mockResolvedValue({ ...entity, images: [...entity.images, 'https://cdn/x.jpg'] });
    const result = await ops.addImages('e1', () => true, [
      { buffer: Buffer.from('x') } as any,
    ]);
    expect(withLock).toHaveBeenCalled();
    expect(repository.addImages).toHaveBeenCalled();
    expect(result.images).toContain('https://cdn/x.jpg');
  });

  it('removeImage refuses last image', async () => {
    repository.findById.mockResolvedValue({
      ...entity,
      images: ['https://cdn/a.jpg'],
    });
    await expect(
      ops.removeImage('e1', () => true, 'https://cdn/a.jpg'),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('removeImage rejects unknown url', async () => {
    await expect(
      ops.removeImage('e1', () => true, 'https://cdn/missing.jpg'),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('removeImage deletes from storage and repository', async () => {
    repository.removeImage.mockResolvedValue({ ...entity, images: ['https://cdn/b.jpg'] });
    await ops.removeImage('e1', () => true, 'https://cdn/a.jpg');
    expect(repository.removeImage).toHaveBeenCalledWith('e1', 'https://cdn/a.jpg');
  });

  it('reorderImages rejects non-permutation', async () => {
    await expect(
      ops.reorderImages('e1', () => true, ['https://cdn/a.jpg']),
    ).rejects.toBeInstanceOf(BadRequestError);
  });

  it('reorderImages no-ops when order unchanged', async () => {
    const result = await ops.reorderImages('e1', () => true, [...entity.images]);
    expect(repository.reorderImages).not.toHaveBeenCalled();
    expect(result.images).toEqual(entity.images);
  });

  it('reorderImages persists a real reorder', async () => {
    const reordered = ['https://cdn/b.jpg', 'https://cdn/a.jpg'];
    repository.reorderImages.mockResolvedValue({ ...entity, images: reordered });
    const result = await ops.reorderImages('e1', () => true, reordered);
    expect(repository.reorderImages).toHaveBeenCalledWith('e1', reordered);
    expect(result.images).toEqual(reordered);
  });
});
