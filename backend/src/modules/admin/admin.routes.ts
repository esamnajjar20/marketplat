import { Router } from 'express';
import { adminController } from './admin.controller';
import { sellersController } from '../sellers/sellers.controller';
import { storesController } from '../stores/stores.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireMinRole } from '../../middlewares/admin.middleware';
import { ROLES } from '../../shared/constants/roles';

export const adminRouter = Router();

// Gap #20 (admin permission tiers): this router used to gate
// everything under one blanket `.use(authenticate, requireAdmin)`.
// Split per-route now that MODERATOR is a real, narrower tier —
// ads-moderation stays reachable by MODERATOR, everything else
// (sellers/stores/users/broadcast/stats — anything that touches
// user/store/seller records or sends a mass notification) requires
// ADMIN or above. `authenticate` alone stays router-level since every
// route here needs it regardless of which role tier it requires.
adminRouter.use(authenticate);

// Dashboard stats — FIX FEAT-05. ADMIN+ rather than MODERATOR+: the
// response includes totalUsers/activeUsers, the same user-management
// data the /users routes below are gated on.
adminRouter.get('/stats', requireMinRole(ROLES.ADMIN), adminController.getStats);

// Ads management — MODERATOR+ (Gap #20: ads moderation is explicitly
// in the MODERATOR tier, same as reports/fraud).
adminRouter.get('/ads', requireMinRole(ROLES.MODERATOR), adminController.getAllAds);
adminRouter.patch('/ads/:id/featured', requireMinRole(ROLES.MODERATOR), adminController.setAdFeatured);
adminRouter.patch('/ads/:id/pinned', requireMinRole(ROLES.MODERATOR), adminController.setAdPinned);
adminRouter.delete('/ads/:id', requireMinRole(ROLES.MODERATOR), adminController.deleteAd);

// Users management — ADMIN+ only (Gap #20: MODERATOR has no access to
// user accounts or role changes at all).
adminRouter.get('/users', requireMinRole(ROLES.ADMIN), adminController.getAllUsers);
adminRouter.patch('/users/:id/active', requireMinRole(ROLES.ADMIN), adminController.toggleUserActive);
// changeRole additionally self-checks the actor/target/newRole rank
// relationship inside adminService.changeRole (see roleHierarchy.ts) —
// requireMinRole(ADMIN) here is just the entry gate (MODERATOR can't
// even attempt it), not the full authorization decision.
adminRouter.patch('/users/:id/role', requireMinRole(ROLES.ADMIN), adminController.changeRole);

// EPIC 1.1: GET /admin/sellers — was missing entirely, so there was no
// way to discover a sellerProfileId to pass into verify/suspend below.
// ADMIN+ (Gap #20: sellers are outside the MODERATOR tier).
adminRouter.get('/sellers', requireMinRole(ROLES.ADMIN), sellersController.getAllSellers);

// Seller verification — separate from any public/self-service seller
// route; only an admin can flip `verified`. See seller-profile-design.md
// §12: no route anywhere lets a client write trustScore/stats directly.
adminRouter.patch('/sellers/:id/verify', requireMinRole(ROLES.ADMIN), sellersController.verifySeller);

// AUDIT-FIX: admin-only suspend/unsuspend — the previously-missing
// "remove seller status" mechanism. Soft suspension rather than
// deletion, since SellerProfile is the parent of Ad/SellerRating/
// ServiceProviderDetails records that must not be cascade-deleted.
adminRouter.patch('/sellers/:id/suspend', requireMinRole(ROLES.ADMIN), sellersController.suspendSeller);

// AUDIT-FIX (issue #1): GET /admin/stores — was missing entirely, so
// stores created via POST /stores stayed PENDING forever with no way
// for an admin to even discover them, let alone approve/block them.
// Reuses storesService.updateStoreStatus (already existed, unreachable)
// via storesController.updateStoreStatus, which is already mounted on
// the public /stores router at PATCH /stores/:id/status (admin-guarded
// there too) — exposing it here as well keeps the admin surface
// consistent with /admin/sellers/:id/verify's own router. ADMIN+
// (Gap #20: stores are outside the MODERATOR tier).
adminRouter.get('/stores', requireMinRole(ROLES.ADMIN), storesController.getAllStores);
adminRouter.patch('/stores/:id/status', requireMinRole(ROLES.ADMIN), storesController.updateStoreStatus);

// Epic 6: manual PROMOTION broadcast — see notifications.service.ts's
// broadcastPromotion doc comment for why this has no automatic trigger.
// ADMIN+ (Gap #20: a mass broadcast to users is outside the MODERATOR
// tier).
adminRouter.post('/notifications/broadcast', requireMinRole(ROLES.ADMIN), adminController.broadcastNotification);
