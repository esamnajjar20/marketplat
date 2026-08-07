import { fraudRepository } from './fraud.repository';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { env } from '../../config/env';
import { logger } from '../../shared/utils/logger';
import { auditLog, AuditEvent } from '../../shared/utils/auditLog';
import { prisma } from '../../config/prisma';
import { FraudSignalType, Prisma } from '@prisma/client';
import { ManualFlagInput } from './fraud.validation';
import { FraudSignalWithSubjects, FlaggedAdRow } from './fraud.repository';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { GetFlaggedAdsQuery, GetFraudSignalsQuery } from './fraud.validation';

// Off-platform-contact keyword/pattern heuristics for
// SUSPICIOUS_CONTACT_PATTERN. Deliberately conservative (a URL or a
// standalone digit run long enough to be a phone number) — this only
// ever contributes points toward riskScore, it never blocks ad
// creation by itself, so a false positive here just means a human
// admin glances at an otherwise-fine ad, not that a legitimate seller
// is locked out.
const URL_PATTERN = /(https?:\/\/|www\.)\S+/i;
const PHONE_LIKE_PATTERN = /\b(?:\+?\d[\s-]?){7,}\b/;

// Common scam-listing phrasing (payment steered off-platform, urgency
// pressure, etc.) — English + Arabic, since this marketplace serves
// both (see product-info's Multi-language gap). Intentionally a short,
// high-signal list rather than an exhaustive one: broad matching here
// produces false positives on completely ordinary listings.
const SCAM_KEYWORD_PATTERNS: RegExp[] = [
  /wire\s*transfer\s*only/i,
  /western\s*union/i,
  /gift\s*card/i,
  /send.*deposit.*first/i,
  /حوالة\s*بنكية\s*فقط/,
  /ادفع.*مقدم.*قبل/,
];

export interface ScoreAdInput {
  id: string;
  userId: string;
  title: string;
  description: string;
  city: string;
  price: number | null;
  categoryId: string | null;
}

interface ComputedSignal {
  type: FraudSignalType;
  weight: number;
  metadata?: Record<string, unknown>;
}

async function computeSignals(input: ScoreAdInput): Promise<ComputedSignal[]> {
  const signals: ComputedSignal[] = [];

  // --- RAPID_POSTING -------------------------------------------------
  // Runs against ads.repository's own createAd insert, which has
  // already committed by the time scoreAd is called (see the
  // fire-and-forget call site in ads.service.ts) — so this count
  // naturally includes the ad just created.
  const recentCount = await fraudRepository.countRecentAdsByUser(
    input.userId,
    env.fraud.rapidPostingWindowSeconds
  );
  if (recentCount > env.fraud.rapidPostingMaxPosts) {
    signals.push({
      type: 'RAPID_POSTING',
      weight: Math.min(40, 15 + (recentCount - env.fraud.rapidPostingMaxPosts) * 5),
      metadata: {
        postsInWindow: recentCount,
        windowSeconds: env.fraud.rapidPostingWindowSeconds,
        maxAllowed: env.fraud.rapidPostingMaxPosts,
      },
    });
  }

  // --- SUSPICIOUS_PRICE ------------------------------------------------
  if (input.price !== null && input.categoryId) {
    const median = await fraudRepository.getCategoryMedianPrice(input.categoryId, input.id);
    if (median !== null && median > 0) {
      const ratio = input.price / median;
      // Far below median: classic "too good to be true" bait.
      // Far above median: possible listing-fee scam or bad-faith outlier.
      if (ratio <= 0.15) {
        signals.push({
          type: 'SUSPICIOUS_PRICE',
          weight: 30,
          metadata: { price: input.price, categoryMedian: median, direction: 'below', ratio },
        });
      } else if (ratio >= 8) {
        signals.push({
          type: 'SUSPICIOUS_PRICE',
          weight: 15,
          metadata: { price: input.price, categoryMedian: median, direction: 'above', ratio },
        });
      }
    }
  }

  // --- SUSPICIOUS_CONTACT_PATTERN --------------------------------------
  const text = `${input.title}\n${input.description}`;
  const hasUrl = URL_PATTERN.test(text);
  const hasPhoneLike = PHONE_LIKE_PATTERN.test(text);
  if (hasUrl || hasPhoneLike) {
    signals.push({
      type: 'SUSPICIOUS_CONTACT_PATTERN',
      weight: hasUrl && hasPhoneLike ? 25 : 15,
      metadata: { hasUrl, hasPhoneLike },
    });
  }

  // --- SUSPICIOUS_KEYWORDS ----------------------------------------------
  const matchedKeyword = SCAM_KEYWORD_PATTERNS.find(pattern => pattern.test(text));
  if (matchedKeyword) {
    signals.push({
      type: 'SUSPICIOUS_KEYWORDS',
      weight: 35,
      metadata: { pattern: matchedKeyword.source },
    });
  }

  // --- DUPLICATE_LISTING --------------------------------------------
  const duplicates = await fraudRepository.findPotentialDuplicates(
    input.userId,
    input.title,
    input.city,
    input.id
  );
  if (duplicates.length > 0) {
    signals.push({
      type: 'DUPLICATE_LISTING',
      weight: 20,
      metadata: { duplicateAdId: duplicates[0].id },
    });
  }

  // --- NEW_ACCOUNT_HIGH_ACTIVITY --------------------------------------
  // Only meaningful in combination with at least one other signal —
  // account age alone is never suspicious (every seller was new once).
  if (signals.length > 0) {
    const createdAt = await fraudRepository.findUserCreatedAt(input.userId);
    if (createdAt) {
      const ageHours = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
      if (ageHours <= env.fraud.newAccountWindowHours) {
        signals.push({
          type: 'NEW_ACCOUNT_HIGH_ACTIVITY',
          weight: 15,
          metadata: { accountAgeHours: Math.round(ageHours) },
        });
      }
    }
  }

  return signals;
}

export const fraudService = {
  /**
   * Scores a single ad against every heuristic, persists one
   * FraudSignal row per signal that fired, and updates the ad's
   * riskScore/flaggedForReview. Deliberately never throws outward past
   * its own logging — every call site (ads.service.ts's createAd) runs
   * this fire-and-forget, same contract as savedSearchEvents.onAdCreated
   * and activityService.record: a scoring failure must never fail the
   * ad creation/update it's scoring.
   */
  scoreAd: async (input: ScoreAdInput): Promise<void> => {
    try {
      const signals = await computeSignals(input);
      const riskScore = Math.min(
        100,
        signals.reduce((sum, s) => sum + s.weight, 0)
      );
      const flaggedForReview = riskScore >= env.fraud.autoFlagThreshold;

      await prisma.$transaction(async tx => {
        if (signals.length > 0) {
          await tx.fraudSignal.createMany({
            data: signals.map(s => ({
              type: s.type,
              weight: s.weight,
              metadata: (s.metadata ?? {}) as Prisma.InputJsonValue,
              userId: input.userId,
              adId: input.id,
            })),
          });
        }
        await fraudRepository.setAdRiskScore(tx, input.id, riskScore, flaggedForReview);
      });

      if (flaggedForReview) {
        logger.warn('Ad auto-flagged for fraud review', {
          adId: input.id,
          userId: input.userId,
          riskScore,
          signalTypes: signals.map(s => s.type),
        });
      }
    } catch (err) {
      logger.error('Fraud scoring failed for ad — ad creation itself is unaffected', {
        err,
        adId: input.id,
        userId: input.userId,
      });
    }
  },

  getFlaggedAds: async (query: GetFlaggedAdsQuery): Promise<PaginatedResult<FlaggedAdRow>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { ads, total } = await fraudRepository.findFlaggedAds(query);
    return { items: ads, meta: buildPaginationMeta(total, page, limit) };
  },

  getSignals: async (
    query: GetFraudSignalsQuery
  ): Promise<PaginatedResult<FraudSignalWithSubjects>> => {
    const page = query.page || 1;
    const limit = query.limit || 20;
    const { signals, total } = await fraudRepository.findSignals(query);
    return { items: signals, meta: buildPaginationMeta(total, page, limit) };
  },

  /**
   * Marks a signal as reviewed by an admin. Does NOT automatically
   * clear the ad's flaggedForReview — an ad can have multiple signals,
   * and reviewing one doesn't mean the others (or the ad overall) have
   * been cleared. Use clearAdFlag explicitly once an admin has decided
   * the ad itself is fine.
   */
  reviewSignal: async (
    signalId: string,
    adminUserId: string
  ): Promise<FraudSignalWithSubjects> => {
    const existing = await fraudRepository.findSignalById(signalId);
    if (!existing) throw new NotFoundError('Fraud signal not found', 'FRAUD_SIGNAL_NOT_FOUND');

    const updated = await fraudRepository.markSignalReviewed(signalId, adminUserId);

    auditLog({
      event: AuditEvent.ADMIN_FRAUD_SIGNAL_REVIEWED,
      userId: adminUserId,
      details: { signalId, signalType: existing.type, adId: existing.adId ?? undefined },
    }).catch(() => {});

    return updated;
  },

  /** Admin decided a flagged ad is legitimate — clears the review flag without deleting the historical signals. */
  clearAdFlag: async (adId: string, adminUserId: string): Promise<void> => {
    await fraudRepository.clearAdFlag(adId);
    auditLog({
      event: AuditEvent.ADMIN_FRAUD_SIGNAL_REVIEWED,
      userId: adminUserId,
      details: { adId, action: 'cleared_flag' },
    }).catch(() => {});
  },

  /** Manual flag — see FraudSignalType.MANUAL_ADMIN_FLAG's doc comment in schema.prisma. */
  manualFlag: async (
    adId: string,
    input: ManualFlagInput,
    adminUserId: string
  ): Promise<void> => {
    await prisma.$transaction(async tx => {
      await tx.fraudSignal.create({
        data: {
          type: 'MANUAL_ADMIN_FLAG',
          weight: input.weight,
          metadata: { reason: input.reason, flaggedBy: adminUserId } as Prisma.InputJsonValue,
          adId,
          userId: input.userId,
        },
      });
      const ad = await tx.ad.findUnique({ where: { id: adId }, select: { riskScore: true } });
      if (!ad) throw new NotFoundError('Ad not found', 'AD_NOT_FOUND');
      const newRiskScore = Math.min(100, ad.riskScore + input.weight);
      await tx.ad.update({
        where: { id: adId },
        data: { flaggedForReview: true, riskScore: newRiskScore },
      });
    });

    auditLog({
      event: AuditEvent.ADMIN_FRAUD_MANUAL_FLAG,
      userId: adminUserId,
      details: { adId, reason: input.reason, targetUserId: input.userId ?? undefined },
    }).catch(() => {});
  },
};
