/**
 * Snippet to merge into stores.routes.ts
 *
 * Import at top:
 *   import { storeMembersController } from './store-members.controller';
 *   (or add methods to storesController)
 *
 * Add these routes AFTER the /me/* block and BEFORE the public /:id routes
 * so "members" is never swallowed as an :id param.
 */

/*
// ─── Store members (staff permissions) ───────────────────────────────────────

// Pending invites for the current user (any store)
storesRouter.get(
  '/me/member-invites',
  authenticate,
  CACHE.NONE,
  storeMembersController.listMyPendingInvites
);
storesRouter.post(
  '/me/member-invites/:memberId/accept',
  authenticate,
  storeMembersController.acceptInvite
);

// Team list + mutations (owner or MANAGER)
storesRouter.get(
  '/:id/members',
  authenticate,
  CACHE.NONE,
  storeMembersController.listMembers
);
storesRouter.post(
  '/:id/members',
  authenticate,
  storeMembersController.inviteMember
);
storesRouter.patch(
  '/:id/members/:memberId',
  authenticate,
  storeMembersController.updateMemberRole
);
storesRouter.delete(
  '/:id/members/:memberId',
  authenticate,
  storeMembersController.removeMember
);
*/
