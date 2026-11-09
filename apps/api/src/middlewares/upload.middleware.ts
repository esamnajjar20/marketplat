// the hardcoded "10" in upload.array() and in
// the two "Maximum 10 images allowed" strings is now derived from
// MAX_IMAGES_PER_ENTITY -- the same constant multer.limits.files already
// reads -- so raising the cap is a one-line change in config/limits.ts.
import multer, { FileFilterCallback } from 'multer';
import { Request, Response, NextFunction } from 'express';
import { BadRequestError } from '../shared/errors/BadRequestError';
import { ServiceUnavailableError } from '../shared/errors/ServiceUnavailableError';
import { acquireMediaUploadLease } from '../shared/utils/distributedSemaphore';
import { logger } from '../shared/utils/logger';
import { isAllowedImageContent } from '../shared/utils/fileSignature';
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGES_PER_ENTITY,
} from '../config/limits';

/**
 * SEC FIX (MIME-01): the multer `fileFilter` above only ever sees
 * `file.mimetype`, which comes from the client-supplied Content-Type
 * part header in the multipart body — trivially spoofable by any HTTP
 * client, regardless of the file's real bytes. That check alone let a
 * malicious payload (e.g. an HTML file with an embedded script, or any
 * non-image binary) through as long as the attacker lied about the
 * Content-Type header.
 *
 * This runs *after* multer has buffered the file (memoryStorage), once
 * the real bytes are available, and rejects any file whose actual magic
 * bytes don't match one of the allowed image signatures — independent of
 * whatever Content-Type the client claimed. This closes the gap without
 * changing the existing fileFilter, which still cheaply rejects obviously
 * wrong declared types before multer spends any effort buffering them.
 */

/** Run Multer under one Redis-backed lease shared by all API replicas. */
const runWithDistributedMediaSlot = (
  req: Request,
  res: Response,
  next: NextFunction,
  run: (callback: (error?: unknown) => void) => void,
): void => {
  let releaseLease: (() => Promise<void>) | undefined;
  let settled = false;

  const cleanup = (): void => {
    if (settled) return;
    settled = true;
    res.off('finish', cleanup);
    res.off('close', cleanup);
    if (releaseLease) {
      void releaseLease().catch(error => {
        logger.error('Failed to release distributed media upload lease', {
          error: error instanceof Error ? error.message : 'unknown Redis error',
        });
      });
    }
  };

  res.once('finish', cleanup);
  res.once('close', cleanup);

  void acquireMediaUploadLease().then(lease => {
    if (!lease) {
      cleanup();
      next(new ServiceUnavailableError(
        'Media upload capacity is temporarily full. Please retry shortly.',
        'MEDIA_UPLOAD_CAPACITY',
      ));
      return;
    }

    if (settled || res.destroyed || res.writableEnded) {
      void lease.release().catch(error => {
        logger.error('Failed to release late distributed media upload lease', {
          error: error instanceof Error ? error.message : 'unknown Redis error',
        });
      });
      return;
    }
    releaseLease = () => lease.release();

    run(error => {
      if (error) next(error);
      else next();
    });
  }).catch(error => {
    cleanup();
    logger.error('Distributed media upload semaphore unavailable', {
      error: error instanceof Error ? error.message : 'unknown Redis error',
    });
    next(new ServiceUnavailableError(
      'Media upload service is temporarily unavailable. Please retry shortly.',
      'MEDIA_UPLOAD_COORDINATION_UNAVAILABLE',
    ));
  });
};

const verifyFileContent = (req: Request, res: Response, next: NextFunction): void => {
  const files: Express.Multer.File[] = req.file
    ? [req.file]
    : Array.isArray(req.files)
      ? req.files
      : [];

  for (const file of files) {
    if (!isAllowedImageContent(file.buffer)) {
      next(
        new BadRequestError(
          'Uploaded file is not a valid JPEG, PNG, or WebP image',
          'INVALID_FILE_TYPE'
        )
      );
      return;
    }
  }
  next();
};

/**
 * this used to call back with a bare `new Error(...)`,
 * which — once wrapped downstream as `new BadRequestError(uploadErr.message)`
 * with no explicit code — fell back to the generic VALIDATION_ERROR
 * dictionary entry ("البيانات المرسلة غير صحيحة") instead of the
 * INVALID_FILE_TYPE entry ("نوع الملف غير مدعوم") already used two
 * lines below in verifyFileContent() for the equivalent real-content
 * check. Passing a BadRequestError with the code set here means both
 * the declared-Content-Type check (this function) and the actual-
 * file-bytes check (verifyFileContent) now resolve to the same, more
 * specific Arabic message instead of the declared-type check alone
 * being generic.
 */
const fileFilter = (_req: Request, file: Express.Multer.File, cb: FileFilterCallback): void => {
  if (!(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    cb(new BadRequestError('Only JPEG, PNG and WebP images are allowed', 'INVALID_FILE_TYPE'));
    return;
  }
  cb(null, true);
};

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE_BYTES,
    // M-07: add explicit limits to prevent multipart DoS attacks
    files: MAX_IMAGES_PER_ENTITY, // max files per request, same cap as per-entity image count
    fields: 20, // max 20 non-file fields
    parts: 30, // files + fields combined
    fieldSize: 10_240, // 10KB per text field
  },
});

/**
 * multer's `limits` option has no "total request size"
 * knob — only per-file (`fileSize`), per-field (`fieldSize`), and
 * count limits (`files`/`fields`/`parts`). Those bound the *worst
 * case* (10 files × 5MB = up to 50MB) but nothing rejected a request
 * before multer.memoryStorage() had already buffered however much of
 * it arrived into process memory. Under concurrent load — several
 * uploads near that worst case at once — this is exactly the kind of
 * per-request memory spike ecosystem.config.js's
 * max_memory_restart: '512M' can trip on, causing an unrelated worker
 * restart mid-request instead of a clean 413 to the one oversized
 * request.
 *
 * Checks Content-Length (a plain header read, no body access) BEFORE
 * calling into multer at all, so an oversized request is rejected
 * without buffering a single byte of it. This is a heuristic ceiling,
 * not exact enforcement — a client that lies about Content-Length or
 * omits it (chunked transfer-encoding) bypasses this specific check
 * and falls through to multer's own per-file/per-count limits above,
 * which still apply regardless.
 */
// Was a bare `55 * 1024 * 1024` literal; now derived from the same
// per-file/per-count limits above so it can't silently drift out of
// sync if either one changes.
export const MAX_TOTAL_REQUEST_BYTES =
  MAX_IMAGES_PER_ENTITY * MAX_IMAGE_SIZE_BYTES + 5 * 1024 * 1024; // files + form-field overhead headroom

export const rejectOversizedContentLength = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const contentLength = req.headers['content-length'];
  if (contentLength && Number(contentLength) > MAX_TOTAL_REQUEST_BYTES) {
    // was a bare BadRequestError with no code, falling
    // back to the generic VALIDATION_ERROR message.
    next(new BadRequestError('Request too large', 'REQUEST_TOO_LARGE'));
    return;
  }
  next();
};

// Single image (avatar uploads etc.)
export const uploadMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  rejectOversizedContentLength(req, res, (sizeError?: unknown) => {
    if (sizeError) return next(sizeError);

    // Image uploads use memoryStorage too. They must share the global lease
    // with audio/document uploads, otherwise the most memory-intensive routes
    // (ads/products/services) bypass the cluster-wide concurrency cap.
    runWithDistributedMediaSlot(req, res, next, done => {
      upload.single('image')(req, res, (uploadErr: unknown) => {
        if (uploadErr instanceof multer.MulterError) {
          if (uploadErr.code === 'LIMIT_FILE_SIZE')
            return done(new BadRequestError('File size must be less than 5MB', 'FILE_TOO_LARGE'));
          if (uploadErr.code === 'LIMIT_UNEXPECTED_FILE')
            return done(new BadRequestError('Unexpected file field', 'UNEXPECTED_FILE_FIELD'));
          if (uploadErr.code === 'LIMIT_FIELD_COUNT')
            return done(new BadRequestError('Too many form fields', 'TOO_MANY_FORM_FIELDS'));
          return done(new BadRequestError(uploadErr.message, 'INVALID_FILE_TYPE'));
        }
        if (uploadErr instanceof BadRequestError) return done(uploadErr);
        if (uploadErr instanceof Error)
          return done(new BadRequestError(uploadErr.message, 'INVALID_FILE_TYPE'));
        verifyFileContent(req, res, done);
      });
    });
  });
};

// Multiple images (up to 10) for ads/products/services.
export const uploadMultipleMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  rejectOversizedContentLength(req, res, (sizeError?: unknown) => {
    if (sizeError) return next(sizeError);

    runWithDistributedMediaSlot(req, res, next, done => {
      upload.array('images', MAX_IMAGES_PER_ENTITY)(req, res, (uploadErr: unknown) => {
        if (uploadErr instanceof multer.MulterError) {
          if (uploadErr.code === 'LIMIT_FILE_SIZE')
            return done(new BadRequestError('Each file must be less than 5MB', 'FILE_TOO_LARGE'));
          if (uploadErr.code === 'LIMIT_UNEXPECTED_FILE' || uploadErr.code === 'LIMIT_FILE_COUNT')
            return done(
              new BadRequestError(`Maximum ${MAX_IMAGES_PER_ENTITY} images allowed`, 'TOO_MANY_FILES')
            );
          if (uploadErr.code === 'LIMIT_FIELD_COUNT')
            return done(new BadRequestError('Too many form fields', 'TOO_MANY_FORM_FIELDS'));
          return done(new BadRequestError(uploadErr.message, 'INVALID_FILE_TYPE'));
        }
        if (uploadErr instanceof BadRequestError) return done(uploadErr);
        if (uploadErr instanceof Error)
          return done(new BadRequestError(uploadErr.message, 'INVALID_FILE_TYPE'));
        verifyFileContent(req, res, done);
      });
    });
  });
};

// CHAT-VOICE: voice-note upload is intentionally separate from image upload.
// MediaRecorder commonly emits WebM/Opus or Ogg/Opus; accepting only known
// audio MIME types keeps the general image middleware's strict signature rules
// intact while giving chat a bounded, single-file audio path.
const AUDIO_MIME_TYPES = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
] as const;
const MAX_AUDIO_SIZE_BYTES = 8 * 1024 * 1024;

const audioUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!(AUDIO_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(new BadRequestError('Only supported audio recordings are allowed', 'INVALID_AUDIO_TYPE'));
      return;
    }
    cb(null, true);
  },
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES, files: 1, fields: 4, parts: 5, fieldSize: 10_240 },
});

export const uploadAudioMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const contentLength = req.headers['content-length'];
  if (contentLength && Number(contentLength) > MAX_AUDIO_SIZE_BYTES + 64 * 1024) {
    next(new BadRequestError('Voice message is too large', 'FILE_TOO_LARGE'));
    return;
  }
  runWithDistributedMediaSlot(req, res, next, done => {
  audioUpload.single('audio')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        done(new BadRequestError('Voice message is too large', 'FILE_TOO_LARGE'));
        return;
      }
      done(new BadRequestError(err.message, 'INVALID_AUDIO_TYPE'));
      return;
    }
    if (err instanceof BadRequestError) {
      done(err);
      return;
    }
    if (err instanceof Error) {
      done(new BadRequestError(err.message, 'INVALID_AUDIO_TYPE'));
      return;
    }
    done();
  });
  });
};

const MESSAGE_FILE_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-7z-compressed',
  'application/vnd.rar',
  'application/x-rar-compressed',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
] as const;
const MAX_MESSAGE_FILE_SIZE_BYTES = 15 * 1024 * 1024;
// memoryStorage buffers the entire upload in this Node process. Audio and
// document uploads use the same Redis-backed semaphore, shared by every API
// replica, and hold the lease through the downstream provider upload/response.
const messageFileUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!(MESSAGE_FILE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(new BadRequestError('نوع الملف غير مدعوم', 'INVALID_FILE_TYPE'));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: MAX_MESSAGE_FILE_SIZE_BYTES,
    files: 1,
    fields: 4,
    parts: 5,
    fieldSize: 10_240,
  },
});
export const uploadMessageFileMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const contentLength = req.headers['content-length'];
  if (contentLength && Number(contentLength) > MAX_MESSAGE_FILE_SIZE_BYTES + 64 * 1024) {
    next(new BadRequestError('الملف كبير جدًا', 'FILE_TOO_LARGE'));
    return;
  }
  runWithDistributedMediaSlot(req, res, next, done => {
  messageFileUpload.single('file')(req, res, (err: unknown) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      done(new BadRequestError('الملف كبير جدًا (الحد 15 ميغابايت)', 'FILE_TOO_LARGE'));
      return;
    }
    if (err instanceof BadRequestError) {
      done(err);
      return;
    }
    if (err instanceof Error) {
      done(new BadRequestError(err.message, 'INVALID_FILE_TYPE'));
      return;
    }
    done();
  });
  });
};
