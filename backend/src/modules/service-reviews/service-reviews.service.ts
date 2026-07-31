import { prisma } from '../../config/prisma';
import { ServiceReview } from '@prisma/client';
import {
  serviceReviewsRepository,
  ServiceReviewWithRater,
} from './service-reviews.repository';
import { CreateServiceReviewInput, GetServiceReviewsQuery } from './service-reviews.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { serviceRequestsRepository } from '../service-requests/service-requests.repository';
import { sellersRepository } from '../sellers/sellers.repository';

export const serviceReviewsService = {
  // services-design.md §10: only the customer of a COMPLETED request may
  // review it, and only once — the DB's @unique(requestId) is the last
  // line of defense, mirrored here with an explicit pre-check for a
  // clearer error message than a raw P2002.
  createReview: async (
    raterId: string,
    input: CreateServiceReviewInput
  ): Promise<ServiceReview> => {
    const request = await serviceRequestsRepository.findById(input.requestId);
    if (!request) throw new NotFoundError('Service request not found', 'SERVICE_REQUEST_NOT_FOUND');

    if (request.customerId !== raterId) {
      throw new ForbiddenError('Only the customer of this request can leave a review.', 'NOT_YOUR_REQUEST_TO_REVIEW');
    }
    if (request.status !== 'COMPLETED') {
      throw new BadRequestError('You can only review a completed service request.');
    }

    const existing = await serviceReviewsRepository.findByRequestId(input.requestId);
    if (existing) throw new ConflictError('This request has already been reviewed.', 'ALREADY_REVIEWED');

    const sellerProfileId = request.listing.provider.sellerProfileId;

    try {
      return await prisma.$transaction(async tx => {
        const review = await serviceReviewsRepository.create(tx, {
          requestId: input.requestId,
          raterId,
          sellerProfileId,
          score: input.score,
          comment: input.comment,
        });
        await sellersRepository.recomputeRatingAggregate(tx, sellerProfileId);
        return review;
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new ConflictError('This request has already been reviewed.', 'ALREADY_REVIEWED');
      }
      throw error;
    }
  },

  getReviewsForSeller: async (
    sellerProfileId: string,
    query: GetServiceReviewsQuery
  ): Promise<PaginatedResult<ServiceReviewWithRater>> => {
    const { reviews, total } = await serviceReviewsRepository.findManyBySellerProfileId(
      sellerProfileId,
      query
    );
    return {
      items: reviews,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },
};
