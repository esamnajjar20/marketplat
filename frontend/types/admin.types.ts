/**
 * Admin-specific types for extended user and ad management.
 *
 * FIX T-03: ReportReason and ReportStatus now match backend Prisma enums exactly.
 *   Backend ReportReason:  SCAM | FAKE | OFFENSIVE | SPAM
 *   Backend ReportStatus:  PENDING | RESOLVED | DISMISSED
 *   (NOT REVIEWED — backend uses RESOLVED)
 *
 * FIX T-10: AdminUser select matches what adminService.getAllUsers actually returns.
 */

import type { User }  from './user.types';
import type { Ad }    from './ad.types';
import type { PaginationParams } from './api.types';

/**
 * FIX T-10: AdminUser matches the select in adminService.getAllUsers.
 * Backend returns: id, name, email, phone, role, city, isActive, createdAt, _count
 * Does NOT return: bio, avatarUrl, updatedAt — omit them to be honest.
 */
export interface AdminUser {
  id:        string;
  name:      string;
  email:     string;
  phone:     string | null;
  role:      'USER' | 'ADMIN';
  city:      string | null;
  isActive:  boolean;
  createdAt: string;
  _count:    { ads: number; reports: number };
}

export interface AdminAd extends Omit<Ad, 'user'> {
  _count: { reports: number };
  /** AdminAd includes user with email for admin display (backend selects only id/name/email here — no avatarUrl/city). */
  user: {
    id:    string;
    name:  string;
    email: string;
  };
}

// ── Request payloads ──────────────────────────────────────────────

export interface AdminGetAdsParams extends PaginationParams {
  status?: string;
  userId?: string;
  /** FIX INTEG-06: drives the search input in AdminAdsTable — matches ad title (backend adminGetAdsSchema). */
  q?: string;
}

export interface AdminGetUsersParams extends PaginationParams {
  isActive?: boolean;
  /** FIX INTEG-06: drives the search input in AdminUsersTable — matches user name or email (backend adminGetUsersSchema). */
  q?: string;
}

export interface SetFeaturedPayload  { isFeatured: boolean; }
export interface SetPinnedPayload    { isPinned:   boolean; }
export interface ToggleActivePayload { isActive:   boolean; }

// ── Report types ──────────────────────────────────────────────────

/**
 * FIX T-03: Must match backend Prisma enum exactly.
 * Backend schema: enum ReportReason { SCAM  FAKE  OFFENSIVE  SPAM }
 */
export type ReportReason =
  | 'SCAM'
  | 'FAKE'
  | 'OFFENSIVE'
  | 'SPAM';

/**
 * FIX T-03: Backend uses RESOLVED (not REVIEWED).
 * Backend schema: enum ReportStatus { PENDING  RESOLVED  DISMISSED }
 */
export type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';

export interface Report {
  id:        string;
  reason:    ReportReason;
  notes:     string | null;
  status:    ReportStatus;
  adId:      string;
  userId:    string;
  createdAt: string;
  ad:        Pick<Ad,   'id' | 'title' | 'status'>;
  user:      Pick<User, 'id' | 'name' | 'email'>;
}

// ── Admin stats ─────────────────────────────────────────────────────
// FIX FEAT-05: matches the real GET /admin/stats response now that the
// endpoint exists — field names aligned with admin.service.ts's getStats().

export interface AdminStats {
  totalAds:    number;
  activeAds:   number;
  totalUsers:  number;
  activeUsers: number;
  openReports: number;
  viewsToday:  number;
}

// ── Sellers (Epic 1.1) ──────────────────────────────────────────────
// The report's finding: verified/suspended exist on SellerProfile and are
// already enforced in ads.service.ts (a suspended seller can't publish),
// but there was no admin UI at all to ever set them — the "verified"
// badge shown everywhere (SellerProfileHeader, ServiceProviderHeader)
// could never actually become true through any reachable screen. This
// type matches sellers.repository.ts's findMany select exactly (only
// user.id/name/email — no email verification status, no full user record).

export interface AdminSeller {
  id:                 string;
  displayName:        string;
  verified:            boolean;
  verificationStatus: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
  suspended:           boolean;
  trustScore:          number;
  averageRating:       string; // Prisma Decimal serializes as a string over JSON
  totalRatings:        number;
  activeAds:           number;
  totalSales:          number;
  createdAt:           string;
  user: {
    id:    string;
    name:  string;
    email: string;
  };
}

export interface AdminGetSellersParams extends PaginationParams {
  verified?:  boolean;
  suspended?: boolean;
  q?: string;
}

export interface SetSellerVerifiedPayload  { verified:  boolean; }
export interface SetSellerSuspendedPayload { suspended: boolean; }

// ── Stores (audit report issue #1) ──────────────────────────────────
// The report's finding: createStore requires admin approval (PENDING →
// ACTIVE) but there was no endpoint or UI to even list PENDING stores,
// so every new store stayed PENDING forever. Matches storesRepository.
// findManyForAdmin's `storeWithSeller` include shape — same sellerProfile
// shape AdminSeller.user narrows, plus the store's own fields.

export type AdminStoreStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED';

export interface AdminStore {
  id:            string;
  name:          string;
  description:   string;
  city:          string;
  address:       string | null;
  phone:         string;
  logoUrl:       string | null;
  coverImageUrl: string | null;
  status:        AdminStoreStatus;
  plan:          string;
  sellerProfileId: string;
  createdAt:     string;
  sellerProfile: {
    id:          string;
    displayName: string;
  };
}

export interface AdminGetStoresParams extends PaginationParams {
  status?: AdminStoreStatus;
  q?: string;
}

export interface UpdateStoreStatusPayload { status: AdminStoreStatus; }

// ── Broadcast notifications ─────────────────────────────────────────
// Backend: POST /admin/notifications/broadcast (broadcastNotificationSchema).
// `userIds` is required by the schema even when `allUsers` is true — the
// backend ignores it and resolves the recipient list itself in that case
// (adminService.getAllActiveUserIds) — see admin.controller.ts's
// broadcastNotification doc comment. The frontend only exposes the
// "send to all active users" path, so it always sends a placeholder
// array to satisfy the min(1) validation.

export interface BroadcastNotificationPayload {
  userIds:   string[];
  allUsers?: boolean;
  title:     string;
  body:      string;
}

export interface BroadcastNotificationResult {
  recipientCount: number;
}

// ── Audit logs ───────────────────────────────────────────────────────
// Backend: GET /admin/audit-logs (audit-logs module). Matches
// audit-logs.repository.ts's `auditLogWithUser` include shape — the
// event's actor (userId) plus their id/name/email, nothing more.
//
// AuditLog has a single actor column, `userId` — whichever user the
// event is attributed to (the acting admin for ADMIN_* events, the
// subject user for auth events like LOGIN_SUCCESS). There is no
// separate "admin vs target user" column, so the filter surface only
// exposes `userId` — see audit-logs.validation.ts's schema comment.

export type AuditEventType =
  | 'REGISTER'
  | 'LOGIN_SUCCESS'
  | 'LOGIN_FAILED'
  | 'LOGOUT'
  | 'LOGOUT_ALL'
  | 'TOKEN_REFRESHED'
  | 'TOKEN_REUSE_DETECTED'
  | 'SESSION_REVOKED'
  | 'ACCOUNT_LOCKED'
  | 'PASSWORD_CHANGED'
  | 'ROLE_CHANGED'
  | 'ACCOUNT_DISABLED'
  | 'ADMIN_AD_FEATURED'
  | 'ADMIN_AD_PINNED'
  | 'ADMIN_AD_DELETED'
  | 'ADMIN_USER_STATUS_CHANGED'
  | 'ADMIN_SELLER_VERIFIED'
  | 'ADMIN_SELLER_SUSPENDED'
  | 'ADMIN_STORE_STATUS_CHANGED'
  | 'OAUTH_LOGIN'
  | 'OAUTH_ACCOUNT_LINKED'
  | 'OAUTH_SIGNUP';

export interface AuditLog {
  id: string;
  event: AuditEventType;
  userId: string | null;
  sessionId: string | null;
  ip: string | null;
  userAgent: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
}

export type AuditLogSortField = 'createdAt' | 'event';

export interface AdminGetAuditLogsParams extends PaginationParams {
  event?: AuditEventType;
  userId?: string;
  from?: string;
  to?: string;
  sortBy?: AuditLogSortField;
  sortOrder?: 'asc' | 'desc';
}
