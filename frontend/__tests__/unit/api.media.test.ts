import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uploadImagesDirect: vi.fn(),
  getNetworkPolicy: vi.fn(),
  recordUploadAttempt: vi.fn(),
  recordUploadResult: vi.fn(),
}));

vi.mock('@/api/direct-upload', () => ({ uploadImagesDirect: mocks.uploadImagesDirect }));
vi.mock('@/lib/networkPolicy', () => ({ getNetworkPolicy: mocks.getNetworkPolicy }));
vi.mock('@/lib/networkObservability', () => ({
  recordUploadAttempt: mocks.recordUploadAttempt,
  recordUploadResult: mocks.recordUploadResult,
}));

import { mediaApi } from '@/api/media.api';

describe('mediaApi direct image uploads', () => {
  beforeEach(() => {
    mocks.uploadImagesDirect.mockReset();
    mocks.recordUploadAttempt.mockReset();
    mocks.recordUploadResult.mockReset();
    mocks.getNetworkPolicy.mockReturnValue({
      tier: 'normal',
      uploadConcurrency: 1,
      uploadTimeoutMs: 40_000,
    });
  });

  it('uploads image bytes directly and returns intent IDs for atomic entity creation', async () => {
    const file = new File(['hello'], 'photo.jpg', { type: 'image/jpeg' });
    const publicId = 'classifieds/requests/mp_0123456789abcdef01234567_0123456789abcdef0123456789abcdef';
    mocks.uploadImagesDirect.mockResolvedValue([publicId]);

    const response = await mediaApi.uploadImages([file]);

    expect(mocks.uploadImagesDirect).toHaveBeenCalledWith([file], 'requests');
    expect(response).toEqual([publicId]);
    expect(mocks.recordUploadAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.recordUploadResult).toHaveBeenCalledWith(true);
  });

  it('records a failed direct upload and propagates the upload error', async () => {
    const error = new Error('direct upload failed');
    mocks.uploadImagesDirect.mockRejectedValue(error);

    await expect(mediaApi.uploadImages([new File(['x'], 'x.jpg', { type: 'image/jpeg' })])).rejects.toBe(error);
    expect(mocks.recordUploadResult).toHaveBeenCalledWith(false);
  });

  it('does not make a request for an empty image list', async () => {
    await expect(mediaApi.uploadImages([])).rejects.toThrow('اختر صورة واحدة على الأقل.');
    expect(mocks.uploadImagesDirect).not.toHaveBeenCalled();
  });
});
