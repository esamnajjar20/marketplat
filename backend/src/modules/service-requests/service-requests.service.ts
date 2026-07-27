import { prisma } from '../../config/prisma';
import { ServiceRequest, ServiceRequestStatus } from '@prisma/client';
import {
  serviceRequestsRepository,
  ServiceRequestWithListing,
} from './service-requests.repository';
import { CreateServiceRequestInput, GetServiceRequestsQuery } from './service-requests.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { serviceListingsRepository } from '../service-listings/service-listings.repository';
import { sellersRepository } from '../sellers/sellers.repository';
import { serviceProvidersRepository } from '../service-providers/service-providers.repository';

// services-design.md §5-§7: single source of truth for legal status
// transitions. Adding a future status (e.g. DISPUTED) is a one-line
// change here, not a hunt through scattered if-statements.
const ALLOWED_TRANSITIONS: Record<ServiceRequestStatus, ServiceRequestStatus[]> = {
  PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED'],
  ACCEPTED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  REJECTED: [],
  CANCELLED: [],
};

// services-design.md §7 table: who is allowed to *initiate* each
// transition — narrower than "is this transition legal at all"
// (ALLOWED_TRANSITIONS). E.g. PENDING->CANCELLED is a legal transition,
// but only the customer may trigger it (a provider withdraws via
// REJECTED, not CANCELLED).
type Actor = 'customer' | 'provider' | 'either';
const TRANSITION_ACTOR: Record<string, Actor> = {
  'PENDING->ACCEPTED': 'provider',
  'PENDING->REJECTED': 'provider',
  'PENDING->CANCELLED': 'customer',
  'ACCEPTED->IN_PROGRESS': 'provider',
  'ACCEPTED->CANCELLED': 'either',
  'IN_PROGRESS->CANCELLED': 'either',
  'IN_PROGRESS->COMPLETED': 'provider',
};

export const serviceRequestsService = {
  createRequest: async (
    customerId: string,
    input: CreateServiceRequestInput
  ): Promise<ServiceRequest> => {
    const listing = await serviceListingsRepository.findById(input.listingId);
    if (!listing || listing.status !== 'ACTIVE') {
      throw new BadRequestError('This service listing is not available for requests.');
    }

    // SECURITY FIX (self-dealing): a provider must not be able to open a
    // request against their own listing — doing so lets them drive the
    // whole PENDING->ACCEPTED->IN_PROGRESS->COMPLETED chain themselves
    // (all provider-only transitions, see TRANSITION_ACTOR below) and
    // then leave themselves a review via service-reviews.service.ts,
    // which only checks request.customerId === raterId — inflating
    // SellerProfile.averageRating/trustScore/totalSales from a fake
    // transaction. sellersService.createRating already guards the
    // equivalent case on the legacy ad-seller rating path
    // (`profile.userId === raterId`); this closes the same gap for the
    // services system, at the earliest point (request creation) so it
    // also blocks fake completedRequestsCount/responseRate inflation,
    // not just fake reviews.
    const provider = await serviceProvidersRepository.findPublicById(listing.providerId);
    if (provider && provider.sellerProfile.userId === customerId) {
      throw new ForbiddenError('You cannot request your own service listing.');
    }

    return prisma.$transaction(async tx =>
      serviceRequestsRepository.create(tx, customerId, input.listingId, {
        details: input.details,
        attachedImages: input.attachedImages ?? [],
      })
    );
  },

  getRequestById: async (userId: string, id: string): Promise<ServiceRequestWithListing> => {
    const request = await serviceRequestsRepository.findById(id);
    if (!request) throw new NotFoundError('Service request not found');

    const isCustomer = request.customerId === userId;
    const isProvider = request.listing.provider.sellerProfile.userId === userId;
    if (!isCustomer && !isProvider) {
      throw new ForbiddenError('You do not have permission to view this request.');
    }
    return request;
  },

  getMyRequestsAsCustomer: async (
    customerId: string,
    query: GetServiceRequestsQuery
  ): Promise<PaginatedResult<ServiceRequestWithListing>> => {
    const { requests, total } = await serviceRequestsRepository.findManyByCustomerId(
      customerId,
      query
    );
    return {
      items: requests,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  getMyRequestsAsProvider: async (
    userId: string,
    query: GetServiceRequestsQuery
  ): Promise<PaginatedResult<ServiceRequestWithListing>> => {
    const sellerProfile = await sellersRepository.findByUserId(userId);
    if (!sellerProfile) throw new NotFoundError('Seller profile not found');

    const provider = await serviceProvidersRepository.findBySellerProfileId(sellerProfile.id);
    if (!provider) throw new NotFoundError('Service provider profile not found');

    const { requests, total } = await serviceRequestsRepository.findManyByProviderId(
      provider.id,
      query
    );
    return {
      items: requests,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },

  // services-design.md §7: the one function every status change flows
  // through — validates the transition is legal, validates the caller
  // is the right actor for it, then does the atomic conditional update.
  respondToRequest: async (
    userId: string,
    requestId: string,
    action: ServiceRequestStatus,
    extra?: { quotedPrice?: number; agreedPrice?: number }
  ): Promise<ServiceRequest> => {
    const request = await serviceRequestsRepository.findById(requestId);
    if (!request) throw new NotFoundError('Service request not found');

    const isCustomer = request.customerId === userId;
    const isProvider = request.listing.provider.sellerProfile.userId === userId;
    if (!isCustomer && !isProvider) {
      throw new ForbiddenError('You do not have permission to act on this request.');
    }

    if (!ALLOWED_TRANSITIONS[request.status].includes(action)) {
      throw new ConflictError(`Cannot transition from ${request.status} to ${action}`);
    }

    const actorRequired = TRANSITION_ACTOR[`${request.status}->${action}`];
    const callerRole: Actor = isProvider ? 'provider' : 'customer';
    if (actorRequired && actorRequired !== 'either' && actorRequired !== callerRole) {
      throw new ForbiddenError(
        `Only the ${actorRequired === 'provider' ? 'service provider' : 'customer'} can perform this action.`
      );
    }

    return prisma.$transaction(async tx => {
      const result = await serviceRequestsRepository.transitionStatus(
        tx,
        requestId,
        request.status,
        action,
        extra
      );
      if (result.count === 0) {
        // Status changed between the read above and this write (rare
        // race) — same "authoritative check at write time" philosophy
        // as createAd.
        throw new ConflictError('Request status has changed — please refresh and try again');
      }
      return tx.serviceRequest.findUniqueOrThrow({ where: { id: requestId } });
    });
  },
};
