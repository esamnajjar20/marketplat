import { StoreDetails, StoreMember, StoreMemberRole, StoreMemberStatus } from '@prisma/client';
import { storeMembersRepository, StoreMemberWithUser } from './store-members.repository';
import { storesRepository } from './stores.repository';
import { sellersRepository } from '../sellers/sellers.repository';
import { prisma } from '../../config/prisma';
import { ConflictError } from '../../shared/errors/ConflictError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { PaginationMeta, buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { auditLog, AuditEvent } from '../../shared/utils/auditLog';
import { notificationEvents } from '../notifications/notifications.service';
import {
  InviteStoreMemberInput,
  UpdateStoreMemberRoleInput,
  ListStoreMembersQuery,
} from './store-members.validation';

/**
 * Capability matrix — keep it simple and explicit.
 * OWNER is never in StoreMember; it is the SellerProfile owner.
 *
 * MANAGER : products, ads, promotions, collections, members (invite/remove/role), store settings
 * STAFF   : reply to messages / update order-like status (future), view products
 * EDITOR  : create/update products, ads & their images only
 */
const ROLE_CAPABILITIES: Record<
  StoreMemberRole,
  {
    manageProducts: boolean;
    manageAds: boolean;
    managePromotions: boolean;
    manageCollections: boolean;
    manageMembers: boolean;
    manageStoreSettings: boolean;
  }
> = {
  MANAGER: {
    manageProducts: true,
    manageAds: true,
    managePromotions: true,
    manageCollections: true,
    manageMembers: true,
    manageStoreSettings: true,
  },
  STAFF: {
    manageProducts: false,
    manageAds: false,
    managePromotions: false,
    manageCollections: false,
    manageMembers: false,
    manageStoreSettings: false,
  },
  EDITOR: {
    manageProducts: true,
    manageAds: true,
    managePromotions: false,
    manageCollections: false,
    manageMembers: false,
    manageStoreSettings: false,
  },
};

export type StoreAccess =
  | { kind: 'owner'; store: StoreDetails }
  | { kind: 'member'; store: StoreDetails; member: StoreMember; role: StoreMemberRole };

/** Resolve store by id or slug (same convention as getPublicStore). */
const resolveStore = async (idOrSlug: string): Promise<StoreDetails> => {
  const store =
    (await storesRepository.findById(idOrSlug)) ??
    (await storesRepository.findBySlug(idOrSlug));
  if (!store) throw new NotFoundError('Store not found.', 'STORE_NOT_FOUND');
  return store;
};

/**
 * Owner = SellerProfile that owns the store.
 * Used by every /me write path already; we reuse the same gate.
 */
const isStoreOwner = async (userId: string, store: StoreDetails): Promise<boolean> => {
  const sellerProfile = await sellersRepository.findByUserId(userId);
  if (!sellerProfile) return false;
  return sellerProfile.id === store.sellerProfileId;
};

/**
 * Require that the caller is either the store owner OR an ACTIVE member
 * with the given capability. Returns a StoreAccess object for callers
 * that need the role.
 */
export const requireStoreAccess = async (
  userId: string,
  storeIdOrSlug: string,
  capability?: keyof (typeof ROLE_CAPABILITIES)[StoreMemberRole]
): Promise<StoreAccess> => {
  const store = await resolveStore(storeIdOrSlug);

  if (await isStoreOwner(userId, store)) {
    return { kind: 'owner', store };
  }

  const member = await storeMembersRepository.findActive(store.id, userId);
  if (!member) {
    throw new ForbiddenError('You do not have access to this store.', 'STORE_ACCESS_DENIED');
  }

  if (capability) {
    const caps = ROLE_CAPABILITIES[member.role];
    if (!caps[capability]) {
      throw new ForbiddenError(
        `Your role (${member.role}) cannot perform this action.`,
        'STORE_ROLE_INSUFFICIENT'
      );
    }
  }

  return { kind: 'member', store, member, role: member.role };
};

/**
 * Owner-only gate (invite / change role / remove). Members with
 * manageMembers can also invite, but only the owner can remove a MANAGER
 * or change anyone to MANAGER — keeps the trust boundary tight.
 */
const requireOwnerOrMemberManager = async (
  userId: string,
  storeIdOrSlug: string
): Promise<StoreAccess> => {
  return requireStoreAccess(userId, storeIdOrSlug, 'manageMembers');
};

export const storeMembersService = {
  /**
   * Invite a platform user (by email) into the store.
   * - Caller must be owner or MANAGER.
   * - Target must already have an account.
   * - Cannot invite the store owner.
   * - Cannot invite someone who already has PENDING/ACTIVE membership.
   */
  invite: async (
    actorUserId: string,
    storeIdOrSlug: string,
    input: InviteStoreMemberInput
  ): Promise<StoreMemberWithUser> => {
    const access = await requireOwnerOrMemberManager(actorUserId, storeIdOrSlug);
    const store = access.store;

    // Only the owner may invite someone as MANAGER (prevents privilege escalation).
    if (input.role === 'MANAGER' && access.kind !== 'owner') {
      throw new ForbiddenError(
        'Only the store owner can invite a MANAGER.',
        'STORE_OWNER_ONLY'
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { email: input.email.toLowerCase().trim() },
      select: { id: true, email: true, name: true, isActive: true },
    });
    if (!targetUser || !targetUser.isActive) {
      throw new NotFoundError(
        'No active account found with that email. They must register first.',
        'USER_NOT_FOUND'
      );
    }

    if (targetUser.id === actorUserId) {
      throw new BadRequestError('You cannot invite yourself.', 'CANNOT_INVITE_SELF');
    }

    if (await isStoreOwner(targetUser.id, store)) {
      throw new ConflictError(
        'This user is already the store owner.',
        'ALREADY_STORE_OWNER'
      );
    }

    // FIX STORE-INVITE-RACE: the pre-insert check (findActiveOrPending)
    // and the createWithUser are two separate reads/writes with no
    // unique constraint on (storeId, userId) to catch a concurrent
    // insert — two simultaneous invite calls for the same target email
    // both see "no existing row", both pass the member cap check, and
    // both insert, leaving two PENDING rows for the same person. A
    // partial unique index would be the definitive fix (unique where
    // status != 'REMOVED') but requires a migration; running the
    // read+guard+insert in a Serializable transaction makes Postgres
    // reject the second attempt with P2034 instead of silently
    // succeeding alongside the first. The P2034 is surfaced as the
    // same ALREADY_MEMBER conflict the pre-check would have produced,
    // so the client UX is unchanged.
    let member;
    try {
      member = await prisma.$transaction(
        async (tx) => {
          const existing = await tx.storeMember.findFirst({
            where: {
              storeId: store.id,
              userId: targetUser.id,
              status: { in: ['PENDING', 'ACTIVE'] },
            },
          });
          if (existing) {
            throw new ConflictError(
              existing.status === 'PENDING'
                ? 'An invitation is already pending for this user.'
                : 'This user is already a member of the store.',
              'ALREADY_MEMBER'
            );
          }

          const activeCount = await tx.storeMember.count({
            where: { storeId: store.id, status: 'ACTIVE' },
          });
          const maxMembers = store.plan === 'FEATURED' ? 20 : 5;
          if (activeCount >= maxMembers) {
            throw new BadRequestError(
              `This store has reached its member limit (${maxMembers}).`,
              'STORE_MEMBER_LIMIT'
            );
          }

          return tx.storeMember.create({
            data: {
              storeId: store.id,
              userId: targetUser.id,
              role: input.role,
              invitedById: actorUserId,
              status: 'PENDING',
            },
            include: {
              user: {
                select: { id: true, name: true, email: true, avatarUrl: true, city: true },
              },
              invitedBy: { select: { id: true, name: true } },
            },
          });
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (e: unknown) {
      if (
        typeof e === 'object' &&
        e !== null &&
        'code' in e &&
        (e as { code?: string }).code === 'P2034'
      ) {
        throw new ConflictError(
          'An invitation is already pending for this user.',
          'ALREADY_MEMBER',
        );
      }
      throw e;
    }

    await auditLog({
      event: AuditEvent.STORE_MEMBER_INVITED,
      userId: actorUserId,
      details: {
        storeId: store.id,
        memberId: member.id,
        targetUserId: targetUser.id,
        role: input.role,
      },
    }).catch(() => undefined);

    // FIX (audit #21): implemented — see notifications.service.ts's
    // onStoreMemberInvited. Fire-and-forget, same as the auditLog call
    // above, so a notification-service hiccup never blocks the invite.
    void notificationEvents
      .onStoreMemberInvited(targetUser.id, store.id, member.id, store.name)
      .catch(() => undefined);

    return member;
  },

  /** Invitee accepts a pending invitation. */
  acceptInvite: async (userId: string, memberId: string): Promise<StoreMember> => {
    const member = await storeMembersRepository.findById(memberId);
    if (!member) throw new NotFoundError('Invitation not found.', 'INVITE_NOT_FOUND');
    if (member.userId !== userId) {
      throw new ForbiddenError('This invitation is not for you.', 'INVITE_NOT_YOURS');
    }
    if (member.status !== 'PENDING') {
      throw new BadRequestError(
        `Invitation is already ${member.status.toLowerCase()}.`,
        'INVITE_NOT_PENDING'
      );
    }

    return storeMembersRepository.accept(memberId);
  },

  /** Change role. Owner can change anyone; MANAGER cannot promote to MANAGER. */
  updateRole: async (
    actorUserId: string,
    storeIdOrSlug: string,
    memberId: string,
    input: UpdateStoreMemberRoleInput
  ): Promise<StoreMember> => {
    const access = await requireOwnerOrMemberManager(actorUserId, storeIdOrSlug);
    const store = access.store;

    const member = await storeMembersRepository.findById(memberId);
    if (!member || member.storeId !== store.id) {
      throw new NotFoundError('Member not found.', 'MEMBER_NOT_FOUND');
    }
    if (member.status === 'REMOVED') {
      throw new BadRequestError('This membership has been removed.', 'MEMBER_REMOVED');
    }

    if (input.role === 'MANAGER' && access.kind !== 'owner') {
      throw new ForbiddenError(
        'Only the store owner can assign the MANAGER role.',
        'STORE_OWNER_ONLY'
      );
    }

    // MANAGER cannot demote/change another MANAGER — only the owner can.
    if (access.kind === 'member' && member.role === 'MANAGER') {
      throw new ForbiddenError(
        'Only the store owner can change a MANAGER.',
        'STORE_OWNER_ONLY'
      );
    }

    return storeMembersRepository.updateRole(memberId, input.role);
  },

  /**
   * Soft-remove a member.
   * - Owner can remove anyone.
   * - MANAGER can remove STAFF / EDITOR only.
   * - Member can leave themselves (any role).
   */
  remove: async (
    actorUserId: string,
    storeIdOrSlug: string,
    memberId: string
  ): Promise<void> => {
    const store = await resolveStore(storeIdOrSlug);
    const member = await storeMembersRepository.findById(memberId);
    if (!member || member.storeId !== store.id) {
      throw new NotFoundError('Member not found.', 'MEMBER_NOT_FOUND');
    }
    if (member.status === 'REMOVED') {
      return; // idempotent
    }

    const isSelf = member.userId === actorUserId;
    const owner = await isStoreOwner(actorUserId, store);

    if (!isSelf && !owner) {
      const actorMember = await storeMembersRepository.findActive(store.id, actorUserId);
      if (!actorMember || actorMember.role !== 'MANAGER') {
        throw new ForbiddenError(
          'You cannot remove this member.',
          'STORE_ACCESS_DENIED'
        );
      }
      if (member.role === 'MANAGER') {
        throw new ForbiddenError(
          'Only the store owner can remove a MANAGER.',
          'STORE_OWNER_ONLY'
        );
      }
    }

    await storeMembersRepository.softRemove(memberId);

    await auditLog({
      event: AuditEvent.STORE_MEMBER_REMOVED,
      userId: actorUserId,
      details: {
        storeId: store.id,
        memberId,
        removedUserId: member.userId,
        wasSelf: isSelf,
      },
    }).catch(() => undefined);
  },

  list: async (
    actorUserId: string,
    storeIdOrSlug: string,
    query: ListStoreMembersQuery
  ): Promise<PaginatedResult<StoreMemberWithUser>> => {
    // Any owner or active member can see the team list.
    const access = await requireStoreAccess(actorUserId, storeIdOrSlug);
    const { members, total } = await storeMembersRepository.findManyByStoreId(
      access.store.id,
      query
    );
    // Signature is buildPaginationMeta(total, page, limit) — same as
    // every other service in this codebase.
    const page = typeof query.page === 'number' ? query.page : 1;
    const limit = typeof query.limit === 'number' ? query.limit : 20;
    const meta: PaginationMeta = buildPaginationMeta(total, page, limit);
    return { items: members, meta };
  },

  /** Pending invites for the current user (any store). */
  listMyPendingInvites: async (userId: string): Promise<StoreMemberWithUser[]> => {
    const rows = await prisma.storeMember.findMany({
      where: { userId, status: StoreMemberStatus.PENDING },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatarUrl: true, city: true },
        },
        invitedBy: { select: { id: true, name: true } },
        store: { select: { id: true, name: true, slug: true, logoUrl: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });
    return rows as unknown as StoreMemberWithUser[];
  },
};

/**
 * Drop-in replacement for requireOwnStore when product/promotion writes
 * should also allow EDITOR / MANAGER.
 *
 * Error semantics mirror requireOwnStore:
 *   - no seller profile / no store / no membership → BadRequestError (400)
 *     so the frontend can still show the "create a store" CTA on 400
 *   - suspended owner acting on their own store → ForbiddenError
 *   - membership on a store whose *owner* is suspended → ForbiddenError
 *     (staff must not write while the owning seller is suspended)
 *
 * Multi-store membership: products endpoints today have no storeId in
 * the body (they assume "the caller's one store"). If the user is a
 * product-capable member of more than one store and owns none, we pick
 * the earliest membership (invitedAt ASC) deterministically. A future
 * pass can thread storeId through product writes if multi-store staff
 * becomes common.
 *
 * Usage in products.service.ts:
 *   const store = await requireStoreAccessForProducts(userId);
 */
export const requireStoreAccessForProducts = async (
  userId: string
): Promise<StoreDetails> => {
  const sellerProfile = await sellersRepository.findByUserId(userId);

  // Owner path — same gates as requireOwnStore.
  if (sellerProfile) {
    if (sellerProfile.suspended) {
      throw new ForbiddenError('Your seller account has been suspended.', 'SELLER_SUSPENDED');
    }
    const ownStore = await storesRepository.findBySellerProfileId(sellerProfile.id);
    if (ownStore) return ownStore;
  }

  // Staff path: active membership with manageProducts, oldest first.
  const memberships = await storeMembersRepository.findActiveByUserId(userId);
  const productCapable = memberships
    .filter((m) => ROLE_CAPABILITIES[m.role].manageProducts)
    .sort(
      (a, b) =>
        new Date(a.invitedAt).getTime() - new Date(b.invitedAt).getTime()
    );

  for (const m of productCapable) {
    const store = await storesRepository.findById(m.storeId);
    if (!store || store.status === 'BLOCKED') continue;

    // Block writes if the *owning* seller is suspended.
    const ownerProfile = await sellersRepository.findById(store.sellerProfileId);
    if (ownerProfile?.suspended) {
      throw new ForbiddenError(
        'This store\'s owner account is suspended.',
        'STORE_OWNER_SUSPENDED'
      );
    }
    return store;
  }

  // Preserve 400 (not 403) when the user simply has no store yet —
  // matches requireOwnStore so existing "create a store" CTAs keep working.
  throw new BadRequestError(
    'You need to create your store first (or be invited as an editor).',
    'STORE_REQUIRED'
  );
};

export { ROLE_CAPABILITIES };
