/**
 * One-time migration: ServiceRequestBroadcast + ServiceQuote → Request + RequestOffer
 * (type = SERVICE). Preserves row ids so acceptedOfferId and deep links keep working.
 *
 * Usage:
 *   DRY_RUN=1 npm run report:migrate-service-broadcasts-to-requests
 *   npm run report:migrate-service-broadcasts-to-requests
 *
 * Safe to re-run: skips broadcasts whose Request id already exists.
 */
import { PrismaClient, Prisma } from '@prisma/client';
import { logger } from '../shared/utils/logger';

const prisma = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

function mapBroadcastStatus(
  status: string,
): 'OPEN' | 'ACCEPTED' | 'CANCELLED' {
  if (status === 'ACCEPTED') return 'ACCEPTED';
  if (status === 'CANCELLED') return 'CANCELLED';
  return 'OPEN';
}

function mapQuoteStatus(
  status: string,
): 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN' {
  if (status === 'ACCEPTED') return 'ACCEPTED';
  if (status === 'DECLINED') return 'DECLINED';
  if (status === 'WITHDRAWN') return 'WITHDRAWN';
  return 'PENDING';
}

async function main(): Promise<void> {
  const broadcasts = await prisma.serviceRequestBroadcast.findMany({
    orderBy: { createdAt: 'asc' },
    include: {
      quotes: {
        include: {
          provider: {
            include: { sellerProfile: { select: { userId: true } } },
          },
        },
      },
    },
  });

  let createdRequests = 0;
  let skippedRequests = 0;
  let createdOffers = 0;
  let skippedOffers = 0;
  let linkedAccepted = 0;
  let errors = 0;

  logger.info('migrateServiceBroadcastsToRequests start', {
    dryRun: DRY_RUN,
    broadcastCount: broadcasts.length,
  });

  for (const b of broadcasts) {
    try {
      const existing = await prisma.request.findUnique({ where: { id: b.id } });
      if (existing) {
        skippedRequests += 1;
      } else if (!DRY_RUN) {
        await prisma.request.create({
          data: {
            id: b.id,
            customerId: b.customerId,
            type: 'SERVICE',
            categoryId: b.categoryId,
            title: b.title,
            description: b.description,
            city: b.city,
            attachedImages: b.attachedImages ?? [],
            status: mapBroadcastStatus(b.status),
            // acceptedOfferId set in a second pass after offers exist
            acceptedOfferId: null,
            attributes: {
              migratedFrom: 'service-request-broadcast',
              legacyBroadcastId: b.id,
            } as Prisma.InputJsonValue,
            createdAt: b.createdAt,
            updatedAt: b.updatedAt,
          },
        });
        createdRequests += 1;
      } else {
        createdRequests += 1; // would create
      }

      for (const q of b.quotes) {
        const offererUserId = q.provider?.sellerProfile?.userId;
        if (!offererUserId) {
          logger.warn('quote missing provider userId — skip', { quoteId: q.id, broadcastId: b.id });
          errors += 1;
          continue;
        }

        const existingOffer = await prisma.requestOffer.findUnique({ where: { id: q.id } });
        if (existingOffer) {
          skippedOffers += 1;
          continue;
        }

        if (!DRY_RUN) {
          await prisma.requestOffer.create({
            data: {
              id: q.id,
              requestId: b.id,
              offererUserId,
              price: q.price,
              message: q.message,
              meta: {
                durationEstimate: q.durationEstimate ?? null,
                migratedFrom: 'service-quote',
                legacyProviderId: q.providerId,
              } as Prisma.InputJsonValue,
              status: mapQuoteStatus(q.status),
              createdAt: q.createdAt,
              updatedAt: q.updatedAt,
            },
          });
        }
        createdOffers += 1;
      }

      // Link accepted offer (same id as accepted quote)
      if (b.acceptedQuoteId && b.status === 'ACCEPTED') {
        if (!DRY_RUN) {
          const offer = await prisma.requestOffer.findUnique({ where: { id: b.acceptedQuoteId } });
          if (offer) {
            await prisma.request.update({
              where: { id: b.id },
              data: {
                status: 'ACCEPTED',
                acceptedOfferId: b.acceptedQuoteId,
              },
            });
            linkedAccepted += 1;
          } else {
            logger.warn('accepted quote missing as offer', {
              broadcastId: b.id,
              acceptedQuoteId: b.acceptedQuoteId,
            });
            errors += 1;
          }
        } else {
          linkedAccepted += 1;
        }
      }
    } catch (err) {
      errors += 1;
      logger.error('migrate broadcast failed', { broadcastId: b.id, err });
    }
  }

  logger.info('migrateServiceBroadcastsToRequests finished', {
    dryRun: DRY_RUN,
    createdRequests,
    skippedRequests,
    createdOffers,
    skippedOffers,
    linkedAccepted,
    errors,
  });
}

main()
  .catch((err) => {
    logger.error('migrateServiceBroadcastsToRequests failed', { err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
