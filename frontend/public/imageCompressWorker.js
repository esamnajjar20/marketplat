/**
 * public/imageCompressWorker.js
 *
 * SW-IMAGE-WORKER-01: off-main-thread image compression.
 *
 * The main-thread versions of these operations (lib/imageOffline.ts)
 * block the UI for 3-9 seconds on a 12 MP phone photo: createImageBitmap
 * decodes, drawImage rasterises at target size, canvas.toBlob encodes
 * to JPEG — all synchronous CPU work on the same thread that renders
 * the form. On a low-end Android with a 12 MP camera that is long
 * enough for the user to think the app has frozen.
 *
 * This worker does the same thing with OffscreenCanvas (available in
 * every Chromium >= 69, Safari >= 16.4, Firefox >= 105 — well within
 * the app's own baseline), communicating only via postMessage.
 *
 * Plain vanilla JS, no imports — this file is served as a static
 * asset from public/ and is NOT transpiled or bundled by Next.js.
 *
 * Protocol:
 *   IN:  { type: 'compress', id, file, maxDim, quality, maxBytes? }
 *   OUT: { id, buffer, size, mimeType }  on success
 *        { id, error: string }           on failure
 *
 * The caller falls back to the main-thread implementation on any
 * error response, so a browser without OffscreenCanvas simply gets
 * the older (slower but working) behaviour.
 */
'use strict';

self.addEventListener('message', async (event) => {
  const msg = event.data;
  if (!msg || msg.type !== 'compress' || typeof msg.id !== 'number') return;

  const { id, file, maxDim, quality, maxBytes } = msg;

  try {
    if (!file || typeof file.type !== 'string' || !file.type.startsWith('image/')) {
      self.postMessage({ id, error: 'not-image' });
      return;
    }

    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas === 'undefined') {
      self.postMessage({ id, error: 'unsupported' });
      return;
    }

    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        self.postMessage({ id, error: 'no-ctx' });
        return;
      }
      ctx.drawImage(bitmap, 0, 0, width, height);

      let q = quality;
      let blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: q });

      if (typeof maxBytes === 'number' && maxBytes > 0) {
        // Up to two downward quality steps. Floor at 0.4 — below that
        // JPEG artefacts are visible enough that the tradeoff stops
        // being worth it on a marketplace listing.
        if (blob.size > maxBytes) {
          q = Math.max(0.55, q - 0.15);
          blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: q });
        }
        if (blob.size > maxBytes) {
          q = Math.max(0.4, q - 0.15);
          blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: q });
        }
      }

      // If the compressed version is no smaller than the original,
      // return an error so the caller keeps the original File
      // untouched (matches main-thread behaviour).
      if (blob.size >= file.size) {
        self.postMessage({ id, error: 'no-benefit' });
        return;
      }

      const buffer = await blob.arrayBuffer();
      self.postMessage(
        { id, buffer, size: blob.size, mimeType: 'image/jpeg' },
        [buffer],
      );
    } finally {
      bitmap.close();
    }
  } catch (err) {
    self.postMessage({
      id,
      error: err && err.message ? err.message : 'unknown',
    });
  }
});
