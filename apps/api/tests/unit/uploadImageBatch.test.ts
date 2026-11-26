const mockUploadImage = jest.fn();
const mockCleanupUploadedImages = jest.fn();

jest.mock('../../src/config/cloudinary', () => ({
  uploadImage: (...args: unknown[]) => mockUploadImage(...args),
}));
jest.mock('../../src/shared/media/cloudinaryHelpers', () => ({
  cleanupUploadedImages: (...args: unknown[]) => mockCleanupUploadedImages(...args),
}));

describe('uploadImageBatch', () => {
  beforeEach(() => {
    jest.resetModules();
    mockUploadImage.mockReset();
    mockCleanupUploadedImages.mockReset().mockResolvedValue(undefined);
  });

  const makeFiles = (count: number): Express.Multer.File[] =>
    Array.from({ length: count }, (_, index) => ({
      buffer: Buffer.from(`file-${index}`),
    }) as Express.Multer.File);

  it('preserves input order and bounds parallel Cloudinary uploads to three', async () => {
    let active = 0;
    let peak = 0;
    mockUploadImage.mockImplementation(async (buffer: Buffer, folder: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise(resolve => setTimeout(resolve, 5));
      active -= 1;
      const name = buffer.toString();
      return { url: `https://cdn.example/${folder}/${name}`, publicId: name };
    });

    const { uploadImageBatch, MAX_PARALLEL_IMAGE_UPLOADS_PER_REQUEST } = await import(
      '../../src/shared/media/uploadImageBatch'
    );
    const result = await uploadImageBatch(makeFiles(10), 'ads');

    expect(MAX_PARALLEL_IMAGE_UPLOADS_PER_REQUEST).toBe(3);
    expect(peak).toBe(3);
    expect(result.map(item => item.publicId)).toEqual(
      Array.from({ length: 10 }, (_, index) => `file-${index}`)
    );
    expect(mockUploadImage).toHaveBeenCalledTimes(10);
    expect(mockCleanupUploadedImages).not.toHaveBeenCalled();
  });

  it('waits for all uploads and cleans successful siblings when one upload fails', async () => {
    mockUploadImage.mockImplementation(async (buffer: Buffer) => {
      const name = buffer.toString();
      await new Promise(resolve => setTimeout(resolve, name === 'file-1' ? 2 : 8));
      if (name === 'file-1') throw new Error('provider rejected upload');
      return { url: `https://cdn.example/${name}`, publicId: name };
    });

    const { uploadImageBatch } = await import('../../src/shared/media/uploadImageBatch');
    await expect(uploadImageBatch(makeFiles(5), 'products')).rejects.toThrow(
      'provider rejected upload'
    );

    // Only the first three uploads were in flight when file-1 failed;
    // the batch must not schedule the remaining files after that failure.
    expect(mockUploadImage).toHaveBeenCalledTimes(3);
    expect(mockCleanupUploadedImages).toHaveBeenCalledWith(['file-0', 'file-2']);
  });

  it('returns an empty batch without contacting Cloudinary', async () => {
    const { uploadImageBatch } = await import('../../src/shared/media/uploadImageBatch');
    await expect(uploadImageBatch([], 'ads')).resolves.toEqual([]);
    expect(mockUploadImage).not.toHaveBeenCalled();
  });
});
