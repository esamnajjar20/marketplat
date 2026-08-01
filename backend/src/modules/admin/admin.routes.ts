import { Router } from 'express';
import { adminController } from './admin.controller';
import { sellersController } from '../sellers/sellers.controller';
import { authenticate } from '../../middlewares/auth.middleware';
import { requireAdmin } from '../../middlewares/admin.middleware';

export const adminRouter = Router();

// All admin routes require authentication + admin role
adminRouter.use(authenticate, requireAdmin);

// Dashboard stats — FIX FEAT-05
adminRouter.get('/stats', adminController.getStats);

// Ads management
adminRouter.get('/ads', adminController.getAllAds);
adminRouter.patch('/ads/:id/featured', adminController.setAdFeatured);
adminRouter.patch('/ads/:id/pinned', adminController.setAdPinned);
adminRouter.delete('/ads/:id', adminController.deleteAd);

// Users management
adminRouter.get('/users', adminController.getAllUsers);
adminRouter.patch('/users/:id/active', adminController.toggleUserActive);
adminRouter.patch('/users/:id/role', adminController.changeRole);

// EPIC 1.1: GET /admin/sellers — was missing entirely, so there was no
// way to discover a sellerProfileId to pass into verify/suspend below.
adminRouter.get('/sellers', sellersController.getAllSellers);

// Seller verification — separate from any public/self-service seller
// route; only an admin can flip `verified`. See seller-profile-design.md
// §12: no route anywhere lets a client write trustScore/stats directly.
adminRouter.patch('/sellers/:id/verify', sellersController.verifySeller);

// AUDIT-FIX: admin-only suspend/unsuspend — the previously-missing
// "remove seller status" mechanism. Soft suspension rather than
// deletion, since SellerProfile is the parent of Ad/SellerRating/
// ServiceProviderDetails records that must not be cascade-deleted.
adminRouter.patch('/sellers/:id/suspend', sellersController.suspendSeller);

// Epic 6: manual PROMOTION broadcast — see notifications.service.ts's
// broadcastPromotion doc comment for why this has no automatic trigger.
adminRouter.post('/notifications/broadcast', adminController.broadcastNotification);
