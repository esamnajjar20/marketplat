import { uploadImage, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from './cloudinaryHelpers';
import { NotFoundError } from '../errors/NotFoundError';
import { ForbiddenError } from '../errors/ForbiddenError';
import { BadRequestError } from '../errors/BadRequestError';
import { ErrorCode } from '../errors/errorCodes';
import { logger } from './logger';

/**
 * FIX SEC-4.1: products.service.ts and service-listings.service.ts each
 * hand-rolled their own addImages/removeImage — ownership check, 10-image
 * cap, lock-guarded re-check, parallel uploads, cleanup-on-failure,
 * "can't remove the last image" guard — with the code close to
 * byte-for-byte identical between the two modules (see the original
 * report's finding). ads.service.ts has the same shape but also carries
 * ads-specific concerns (role-based ownership instead of a single owner
 * id, cache-version bumping) that don't map cleanly onto this shared
 * helper, so it's deliberately left out of this extraction rather than
 * forced to fit.
 *
 * This factory takes the handful of things that actually differ between
 * products and service-listings — the repository, the entity-specific
 * Redis lock, the Cloudinary upload folder, and the not-found/ownership
 * error codes/messages — and returns the two operations built from one
 * shared implementation. Behavior is unchanged from the original two
 * copies; this is a pure refactor.
 */

/** Minimal shape both ProductsRepository and ServiceListingsRepository satisfy. */
interface ImageOwningEntity {
  id: string;
  status: string;
  images: string[];
}

interface ImageOwningRepository<TEntity extends ImageOwningEntity> {
  findById: (id: string) => Promise<TEntity | null>;
  addImages: (id: string, newImages: string[]) => Promise<TEntity>;
  removeImage: (id: string, imageUrl: string) => Promise<TEntity>;
}

interface EntityImageOperationsConfig<TEntity extends ImageOwningEntity> {
  repository: ImageOwningRepository<TEntity>;
  /** Redis lock scoped to this entity type, e.g. withProductImagesLock. */
  withLock: <T>(entityId: string, fn: () => Promise<T>) => Promise<T>;
  /** Cloudinary upload folder, e.g. 'products' / 'service-listings'. */
  uploadFolder: string;
  maxImages: number;
  /** Human-readable noun for error messages, e.g. 'product' / 'service listing'. */
  entityLabel: string;
  notFoundCode: string;
  notOwnedCode: string;
}

export interface EntityImageOperations<TEntity extends ImageOwningEntity> {
  addImages: (entityId: string, ownerCheck: (entity: TEntity) => boolean, files: Express.Multer.File[]) => Promise<TEntity>;
  removeImage: (entityId: string, ownerCheck: (entity: TEntity) => boolean, imageUrl: string) => Promise<TEntity>;
}

export function createEntityImageOperations<TEntity extends ImageOwningEntity>(
  config: EntityImageOperationsConfig<TEntity>
): EntityImageOperations<TEntity> {
  const { repository, withLock, uploadFolder, maxImages, entityLabel, notFoundCode, notOwnedCode } = config;

  const findActiveOrThrow = async (entityId: string): Promise<TEntity> => {
    const entity = await repository.findById(entityId);
    if (!entity || entity.status === 'DELETED') {
      throw new NotFoundError(`${entityLabel} not found`, notFoundCode);
    }
    return entity;
  };

  return {
    addImages: async (entityId, ownerCheck, files) => {
      const entity = await findActiveOrThrow(entityId);
      if (!ownerCheck(entity)) {
        throw new ForbiddenError(`You do not own this ${entityLabel}.`, notOwnedCode);
      }
      if (entity.images.length + files.length > maxImages) {
        throw new BadRequestError(`A ${entityLabel} can have at most ${maxImages} images`);
      }

      return withLock(entityId, async () => {
        // Re-check with a fresh read now that we hold the lock — the
        // pre-lock check above is just a fast-fail for the common case;
        // this is the authoritative check (same D-10 race this guards
        // against in ads.service.ts).
        const fresh = await findActiveOrThrow(entityId);
        if (fresh.images.length + files.length > maxImages) {
          throw new BadRequestError(`A ${entityLabel} can have at most ${maxImages} images`);
        }

        const uploads = await Promise.all(files.map(file => uploadImage(file.buffer, uploadFolder)));
        try {
          return await repository.addImages(entityId, uploads.map(upload => upload.url));
        } catch (error) {
          await cleanupUploadedImages(uploads.map(upload => upload.publicId));
          throw error;
        }
      });
    },

    removeImage: async (entityId, ownerCheck, imageUrl) => {
      const entity = await findActiveOrThrow(entityId);
      if (!ownerCheck(entity)) {
        throw new ForbiddenError(`You do not own this ${entityLabel}.`, notOwnedCode);
      }
      if (!entity.images.includes(imageUrl)) {
        throw new BadRequestError(`Image not found in this ${entityLabel}`);
      }
      // EPIC 1.5's rationale applies identically here — a listing must
      // always keep at least one image.
      if (entity.images.length <= 1) {
        throw new BadRequestError(
          `Cannot remove the last image — a ${entityLabel} must have at least one image. Add a replacement image first.`,
          ErrorCode.MIN_IMAGES_REQUIRED
        );
      }

      return withLock(entityId, async () => {
        try {
          const publicId = extractCloudinaryPublicId(imageUrl);
          if (publicId) await deleteImage(publicId);
        } catch (err) {
          // AUDIT-FIX 2.4: continuing on a failed Cloudinary delete is
          // the right call (removing the image from the entity record
          // must not fail just because storage cleanup failed), but this
          // used to log nothing — a failed delete here means an orphaned
          // Cloudinary asset with no trace anywhere to find it later.
          // Logged at warn (not error): expected to happen occasionally
          // (transient Cloudinary errors), doesn't block the user-facing
          // action, but should be visible/searchable for periodic manual
          // or scripted cleanup. Fixed once here for ads/products/
          // service-listings alike, since all three now go through this
          // shared factory (products/service-listings directly; ads.service.ts
          // has its own separate removeImage — see this file's own doc
          // comment on why ads was left out of the addImages/removeImage
          // extraction — but got the same logging fix applied there).
          logger.warn(`Failed to delete ${entityLabel} image from Cloudinary — orphaned asset`, {
            entityId,
            imageUrl,
            err,
          });
        }
        return repository.removeImage(entityId, imageUrl);
      });
    },
  };
}
