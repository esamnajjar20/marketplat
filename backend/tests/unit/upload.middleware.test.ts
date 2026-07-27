import express, { Express, Request, Response } from 'express';
import request from 'supertest';
import {
  uploadMiddleware,
  uploadMultipleMiddleware,
  rejectOversizedContentLength,
  MAX_TOTAL_REQUEST_BYTES,
} from '../../src/middlewares/upload.middleware';
import { errorMiddleware } from '../../src/middlewares/error.middleware';
import {
  validJpegBuffer,
  validPngBuffer,
  validWebpBuffer,
  invalidImageBuffer,
} from '../helpers/fileSignature.helper';

/**
 * Coverage for upload.middleware.ts — this is a security-relevant
 * surface (M-07: explicit multer limits to prevent multipart DoS), so
 * every limit/rejection branch is worth pinning down with a real
 * multipart request through supertest rather than mocking multer away.
 *
 * Each test builds a minimal express app wired only with the
 * middleware under test, so failures are easy to attribute and the
 * suite doesn't depend on the full app's routing/auth stack.
 */
function buildSingleUploadApp(): Express {
  const app = express();
  app.post('/upload', uploadMiddleware, (req: Request, res: Response) => {
    res.status(200).json({ success: true, file: req.file?.originalname ?? null });
  });
  app.use(errorMiddleware);
  return app;
}

function buildMultiUploadApp(): Express {
  const app = express();
  app.post('/upload', uploadMultipleMiddleware, (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    res.status(200).json({ success: true, count: files.length });
  });
  app.use(errorMiddleware);
  return app;
}

describe('upload.middleware', () => {
  describe('uploadMiddleware (single image)', () => {
    it('accepts a valid JPEG under the size limit', async () => {
      const app = buildSingleUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('image', validJpegBuffer(), {
          filename: 'photo.jpg',
          contentType: 'image/jpeg',
        });

      expect(res.status).toBe(200);
      expect(res.body.file).toBe('photo.jpg');
    });

    it('rejects a disallowed mime type (e.g. PDF) with 400', async () => {
      const app = buildSingleUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('image', Buffer.from('%PDF-1.4 fake'), {
          filename: 'doc.pdf',
          contentType: 'application/pdf',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects a file over the 5MB limit with 400 and a clear message', async () => {
      const app = buildSingleUploadApp();
      // Real JPEG signature + padding past the 5MB limit — multer's
      // fileSize limit is enforced mid-stream, before the content-signature
      // check ever runs, so the signature bytes only need to be valid to
      // isolate this test to the size-limit branch specifically.
      const oversized = Buffer.concat([validJpegBuffer(0), Buffer.alloc(5 * 1024 * 1024 + 1, 'a')]);
      const res = await request(app)
        .post('/upload')
        .attach('image', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/5MB/);
    });

    it('rejects an unexpected file field name with 400', async () => {
      const app = buildSingleUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('not_image', Buffer.from('fake'), { filename: 'a.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Unexpected file field/);
    });

    it('succeeds with no file attached (image is optional at the middleware layer)', async () => {
      const app = buildSingleUploadApp();
      const res = await request(app).post('/upload');

      expect(res.status).toBe(200);
      expect(res.body.file).toBeNull();
    });
  });

  describe('uploadMultipleMiddleware (ad images)', () => {
    it('accepts multiple valid images under the 10-file limit', async () => {
      const app = buildMultiUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('images', validJpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
        .attach('images', validPngBuffer(), { filename: 'b.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });

    it('rejects more than 10 images with a clear "Maximum 10 images" message', async () => {
      const app = buildMultiUploadApp();
      let req = request(app).post('/upload');
      for (let i = 0; i < 11; i++) {
        req = req.attach('images', validJpegBuffer(), {
          filename: `img-${i}.jpg`,
          contentType: 'image/jpeg',
        });
      }
      const res = await req;

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/Maximum 10 images/);
    });

    it('rejects a disallowed mime type anywhere in the batch', async () => {
      const app = buildMultiUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('images', Buffer.from('fake-1'), { filename: 'a.jpg', contentType: 'image/jpeg' })
        .attach('images', Buffer.from('not-an-image'), {
          filename: 'malware.exe',
          contentType: 'application/x-msdownload',
        });

      expect(res.status).toBe(400);
    });

    it('rejects any single oversized file in the batch with a per-file message', async () => {
      const app = buildMultiUploadApp();
      const oversized = Buffer.concat([validJpegBuffer(0), Buffer.alloc(5 * 1024 * 1024 + 1, 'a')]);
      const res = await request(app)
        .post('/upload')
        .attach('images', oversized, { filename: 'huge.jpg', contentType: 'image/jpeg' });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/5MB/);
    });
  });

  // SEC FIX (MIME-01): the fileFilter only checks the client-supplied
  // Content-Type header, which is trivially spoofable. These tests pin
  // down the new post-multer magic-byte check, which inspects the
  // actual buffered bytes and rejects anything that doesn't match a
  // real JPEG/PNG/WebP signature — even when the attacker lies about
  // Content-Type to get past the header-only check.
  describe('content verification (magic bytes)', () => {
    it('rejects a file whose real bytes are not an image, even with a spoofed image Content-Type', async () => {
      const app = buildSingleUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('image', invalidImageBuffer(), {
          filename: 'malware.jpg',
          contentType: 'image/jpeg', // spoofed — declares JPEG, but bytes are plain text
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not a valid/i);
    });

    it('accepts a real PNG whose bytes match the PNG signature', async () => {
      const app = buildSingleUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('image', validPngBuffer(), { filename: 'photo.png', contentType: 'image/png' });

      expect(res.status).toBe(200);
    });

    it('accepts a real WebP whose bytes match the RIFF/WEBP signature', async () => {
      const app = buildSingleUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('image', validWebpBuffer(), { filename: 'photo.webp', contentType: 'image/webp' });

      expect(res.status).toBe(200);
    });

    it('rejects a spoofed file in a multi-image batch even if other files in the batch are real images', async () => {
      const app = buildMultiUploadApp();
      const res = await request(app)
        .post('/upload')
        .attach('images', validJpegBuffer(), { filename: 'a.jpg', contentType: 'image/jpeg' })
        .attach('images', invalidImageBuffer(), {
          filename: 'b.jpg',
          contentType: 'image/jpeg', // spoofed
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/not a valid/i);
    });
  });

  // FIX LOAD-02: rejects a request whose Content-Length alone already
  // exceeds the worst-case multipart size (10 files × 5MB + overhead),
  // before multer.memoryStorage() buffers a single byte of it. Tested
  // as a plain function against minimal req/res/next doubles rather
  // than through a real oversized HTTP request — sending genuine 55MB+
  // payloads through supertest for every test run would make the
  // suite slow and memory-heavy for no additional coverage value, since
  // the function only ever reads the Content-Length header, never the
  // body itself.
  describe('rejectOversizedContentLength', () => {
    function makeReq(contentLength?: string): Request {
      return { headers: contentLength ? { 'content-length': contentLength } : {} } as Request;
    }

    it('calls next() with a BadRequestError when Content-Length exceeds the max', () => {
      const req = makeReq(String(MAX_TOTAL_REQUEST_BYTES + 1));
      const next = jest.fn();

      rejectOversizedContentLength(req, {} as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('Request too large');
    });

    it('calls next() with no argument when Content-Length is within the limit', () => {
      const req = makeReq(String(MAX_TOTAL_REQUEST_BYTES - 1));
      const next = jest.fn();

      rejectOversizedContentLength(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('calls next() with no argument when Content-Length is exactly at the limit (boundary is inclusive of the max)', () => {
      const req = makeReq(String(MAX_TOTAL_REQUEST_BYTES));
      const next = jest.fn();

      rejectOversizedContentLength(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
    });

    it('passes through when Content-Length is absent (e.g. chunked transfer-encoding) — multer\'s own limits still apply downstream', () => {
      const req = makeReq(undefined);
      const next = jest.fn();

      rejectOversizedContentLength(req, {} as Response, next);

      expect(next).toHaveBeenCalledWith();
    });
  });
});
