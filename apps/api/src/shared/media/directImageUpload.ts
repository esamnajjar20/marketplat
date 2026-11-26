import { createHash, randomUUID } from 'node:crypto';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../../config/env';
import { BadRequestError } from '../errors/BadRequestError';
import { ForbiddenError } from '../errors/ForbiddenError';
import { ServiceUnavailableError } from '../errors/ServiceUnavailableError';
import { MAX_IMAGE_SIZE_BYTES, MAX_IMAGES_PER_ENTITY } from '../../config/limits';
import type { UploadResult } from '../../config/cloudinary';
import { prisma } from '../../config/prisma';
import type { Prisma } from '@prisma/client';
import { logger } from '../observability/logger';

export const DIRECT_IMAGE_PURPOSES = ['ads', 'products', 'service-listings', 'requests'] as const;
export type DirectImagePurpose = (typeof DIRECT_IMAGE_PURPOSES)[number];

export interface DirectImageUploadIntent {
  publicId: string;
  timestamp: number;
  tags: string;
  overwrite: false;
  transformation: string;
  signature: string;
  apiKey: string;
  cloudName: string;
  uploadUrl: string;
}

const IMAGE_TRANSFORMATION = 'c_limit,h_800,w_1200,q_auto:good,f_webp';
const ALLOWED_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp']);
const MAX_IMAGE_PIXELS = 40_000_000;
const DIRECT_UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000;
const DIRECT_UPLOAD_INTENT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const DIRECT_UPLOAD_INTENT_PRUNE_INTERVAL_MS = 60 * 60 * 1000;
let lastIntentPruneAttemptAt = 0;

function ownerToken(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 24);
}

function assertConfigured(): void {
  if (!env.cloudinary.isConfigured) {
    throw new ServiceUnavailableError('Image upload is temporarily unavailable.');
  }
}

export function isDirectImagePurpose(value: unknown): value is DirectImagePurpose {
  return typeof value === 'string' && (DIRECT_IMAGE_PURPOSES as readonly string[]).includes(value);
}

export async function createDirectImageUploadIntents(
  userId: string,
  purpose: DirectImagePurpose,
  count: number
): Promise<DirectImageUploadIntent[]> {
  assertConfigured();
  const maxCount = purpose === 'requests' ? 5 : MAX_IMAGES_PER_ENTITY;
  if (!Number.isInteger(count) || count < 1 || count > maxCount) {
    throw new BadRequestError(
      `Upload count must be between 1 and ${maxCount}.`,
      'INVALID_UPLOAD_COUNT'
    );
  }

  const token = ownerToken(userId);
  const folder = `classifieds/${purpose}`;
  const tags = `marketplat_direct_upload,marketplat_owner_${token},marketplat_purpose_${purpose}`;
  const uploadUrl = `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.cloudinary.cloudName)}/image/upload`;

  const expiresAt = new Date(Date.now() + DIRECT_UPLOAD_INTENT_TTL_MS);
  const intents = Array.from({ length: count }, () => {
    const timestamp = Math.floor(Date.now() / 1000);
    // Encode the folder in public_id instead of relying on Cloudinary's
    // account-level fixed/dynamic folder mode. This keeps public_id stable
    // in the Admin API response across both account configurations.
    const publicId = `${folder}/mp_${token}_${randomUUID().replace(/-/g, '')}`;
    const signedParameters = {
      overwrite: false,
      public_id: publicId,
      tags,
      timestamp,
      transformation: IMAGE_TRANSFORMATION,
    };
    const signature = cloudinary.utils.api_sign_request(
      signedParameters,
      env.cloudinary.apiSecret
    );

    return {
      publicId,
      timestamp,
      tags,
      overwrite: false as const,
      transformation: IMAGE_TRANSFORMATION,
      signature,
      apiKey: env.cloudinary.apiKey,
      cloudName: env.cloudinary.cloudName,
      uploadUrl,
    };
  });

  // Persist every signed intent before returning its signature to the client.
  // A token that is not present here can never be attached to an entity.
  await prisma.directUploadIntent.createMany({
    data: intents.map(intent => ({
      publicId: intent.publicId,
      userId,
      purpose,
      status: 'PENDING',
      expiresAt,
    })),
  });

  // Bound table growth while retaining a short audit window for consumed and
  // abandoned uploads. Prune at most once per hour per API process so issuing
  // every upload batch does not add another synchronous database round-trip.
  // Expired tokens cannot be consumed even before their rows are pruned.
  const pruneNow = Date.now();
  if (pruneNow - lastIntentPruneAttemptAt >= DIRECT_UPLOAD_INTENT_PRUNE_INTERVAL_MS) {
    lastIntentPruneAttemptAt = pruneNow;
    void prisma.directUploadIntent
      .deleteMany({
        where: { expiresAt: { lt: new Date(pruneNow - DIRECT_UPLOAD_INTENT_RETENTION_MS) } },
      })
      .catch(error => {
        logger.warn('Failed to prune retained direct upload intent records', { error });
      });
  }

  return intents;
}

/**
 * Atomically consumes one batch of upload intents in the caller's Prisma
 * transaction. If any row is missing, expired, consumed, or belongs to a
 * different user/purpose, throwing rolls back every status update in this
 * batch. Concurrent transactions serialize on the matching rows; only one
 * can change PENDING to CONSUMED.
 */
export async function consumeDirectImageUploadIntents(
  tx: Prisma.TransactionClient,
  userId: string,
  purpose: DirectImagePurpose,
  publicIds: string[]
): Promise<void> {
  const maxCount = purpose === 'requests' ? 5 : MAX_IMAGES_PER_ENTITY;
  if (!Array.isArray(publicIds) || publicIds.length < 1 || publicIds.length > maxCount) {
    throw new BadRequestError('Invalid direct image intent batch.', 'DIRECT_UPLOAD_INVALID');
  }
  if (new Set(publicIds).size !== publicIds.length) {
    throw new BadRequestError('Duplicate uploaded image references are not allowed.', 'DUPLICATE_IMAGE');
  }

  const now = new Date();
  const consumed = await tx.directUploadIntent.updateMany({
    where: {
      publicId: { in: publicIds },
      userId,
      purpose,
      status: 'PENDING',
      expiresAt: { gt: now },
    },
    data: { status: 'CONSUMED', consumedAt: now },
  });

  if (consumed.count !== publicIds.length) {
    throw new BadRequestError(
      'One or more image upload intents are invalid, expired, or already used.',
      'DIRECT_UPLOAD_ALREADY_CONSUMED'
    );
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await mapper(item);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Resolve server-signed Cloudinary uploads to canonical assets. The public ID
 * is random and owner-scoped; signed tags bind it to both the authenticated
 * user and the intended feature. Never trust a client-provided delivery URL.
 */
export async function resolveDirectImageUploads(
  userId: string,
  purpose: DirectImagePurpose,
  publicIds: string[]
): Promise<UploadResult[]> {
  assertConfigured();
  const maxCount = purpose === 'requests' ? 5 : MAX_IMAGES_PER_ENTITY;
  if (!Array.isArray(publicIds) || publicIds.length < 1 || publicIds.length > maxCount) {
    throw new BadRequestError(
      `Provide between 1 and ${maxCount} uploaded images.`,
      'INVALID_DIRECT_IMAGES'
    );
  }
  if (new Set(publicIds).size !== publicIds.length) {
    throw new BadRequestError('Duplicate uploaded image references are not allowed.', 'DUPLICATE_IMAGE');
  }

  const token = ownerToken(userId);
  const expectedTags = [
    'marketplat_direct_upload',
    `marketplat_owner_${token}`,
    `marketplat_purpose_${purpose}`,
  ];

  // Fast ownership/purpose preflight only; status and expiry are deliberately
  // checked by the atomic consume inside the entity transaction. This lets an
  // offline-operation replay return its existing record even if its original
  // intent has since been consumed or expired.
  const issuedIntents = await prisma.directUploadIntent.findMany({
    where: {
      publicId: { in: publicIds },
      userId,
      purpose,
    },
    select: { publicId: true },
  });
  if (issuedIntents.length !== publicIds.length) {
    throw new BadRequestError(
      'One or more image upload intents are invalid, expired, or already used.',
      'DIRECT_UPLOAD_ALREADY_CONSUMED'
    );
  }

  try {
    return await mapWithConcurrency(publicIds, 3, async publicId => {
      if (
        typeof publicId !== 'string' ||
        publicId.length > 180 ||
        !new RegExp(`^classifieds/${purpose}/mp_${token}_[a-f0-9]{32}$`).test(publicId)
      ) {
        throw new ForbiddenError('Uploaded image does not belong to this account.', 'DIRECT_UPLOAD_OWNER_MISMATCH');
      }

      const resource = await cloudinary.api.resource(publicId, {
        resource_type: 'image',
        type: 'upload',
      });
      const tags: string[] = Array.isArray(resource.tags) ? resource.tags : [];
      if (
        resource.public_id !== publicId ||
        resource.resource_type !== 'image' ||
        expectedTags.some(tag => !tags.includes(tag))
      ) {
        throw new ForbiddenError('Uploaded image authorization is invalid.', 'DIRECT_UPLOAD_INVALID_ASSET');
      }

      const format = String(resource.format ?? '').toLowerCase();
      const bytes = Number(resource.bytes);
      const width = Number(resource.width);
      const height = Number(resource.height);
      const secureUrl = String(resource.secure_url ?? '');
      const expectedHost = `https://res.cloudinary.com/${env.cloudinary.cloudName}/image/upload/`;
      if (
        !ALLOWED_FORMATS.has(format) ||
        !Number.isFinite(bytes) || bytes < 1 || bytes > MAX_IMAGE_SIZE_BYTES ||
        !Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 ||
        width * height > MAX_IMAGE_PIXELS ||
        !secureUrl.startsWith(expectedHost)
      ) {
        throw new BadRequestError('Uploaded image failed server-side media validation.', 'INVALID_DIRECT_IMAGE');
      }

      return { url: secureUrl, publicId };
    });
  } catch (error) {
    if (
      error instanceof BadRequestError ||
      error instanceof ForbiddenError ||
      error instanceof ServiceUnavailableError
    ) {
      throw error;
    }
    throw new ServiceUnavailableError('Unable to verify uploaded images. Please retry shortly.');
  }
}
