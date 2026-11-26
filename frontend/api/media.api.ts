import { getNetworkPolicy } from '@/lib/networkPolicy';
import { recordUploadAttempt, recordUploadResult } from '@/lib/networkObservability';
import { uploadImagesDirect } from './direct-upload';

/**
 * Request images are uploaded directly from the browser to Cloudinary.
 * The request create endpoint receives the issued public IDs and consumes
 * their intents in the same PostgreSQL transaction that stores the request.
 */

let activeUploads = 0;
const uploadWaiters: Array<() => void> = [];

async function acquireUploadSlot(limit: number): Promise<void> {
  if (limit <= 0) throw new Error('UPLOAD_NETWORK_NOT_ALLOWED');
  if (activeUploads < limit) {
    activeUploads += 1;
    return;
  }
  await new Promise<void>((resolve) => uploadWaiters.push(resolve));
  activeUploads += 1;
}

function releaseUploadSlot(): void {
  activeUploads = Math.max(0, activeUploads - 1);
  const next = uploadWaiters.shift();
  if (next) next();
}

export const mediaApi = {
  uploadImages: async (files: File[]) => {
    const policy = getNetworkPolicy();
    if (!files.length) throw new Error('اختر صورة واحدة على الأقل.');
    await acquireUploadSlot(policy.uploadConcurrency);
    try {
      recordUploadAttempt();
      const publicIds = await uploadImagesDirect(files, 'requests');
      if (!Array.isArray(publicIds) || publicIds.length !== files.length) {
        throw new Error('لم تكتمل عملية رفع صور الطلب.');
      }
      recordUploadResult(true);
      return publicIds;
    } catch (error) {
      recordUploadResult(false);
      throw error;
    } finally {
      releaseUploadSlot();
    }
  },
};
