/**
 * Unit coverage for modules/fraud/fraud.service.ts (/ P0).
 *
 * Integration tests under tests/integration/fraud.test.ts exercise the
 * HTTP surface; this file pins the scoring heuristics, admin review
 * paths, and the fire-and-forget contract (scoring failures must never
 * throw outward to ads.service.createAd).
 */
import { fraudService } from '../../src/modules/fraud/fraud.service';
import { fraudRepository } from '../../src/modules/fraud/fraud.repository';
import { prisma } from '../../src/config/prisma';
import { env } from '../../src/config/env';
import { logger } from '../../src/shared/utils/logger';
import { auditLog, AuditEvent } from '../../src/shared/utils/auditLog';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

jest.mock('../../src/modules/fraud/fraud.repository');
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock('../../src/shared/utils/auditLog', () => ({
  auditLog: jest.fn().mockResolvedValue(undefined),
  AuditEvent: {
    ADMIN_FRAUD_SIGNAL_REVIEWED: 'ADMIN_FRAUD_SIGNAL_REVIEWED',
    ADMIN_FRAUD_MANUAL_FLAG: 'ADMIN_FRAUD_MANUAL_FLAG',
  },
}));
jest.mock('../../src/config/prisma', () => ({
  prisma: {
    $transaction: jest.fn(),
  },
}));

const baseInput = {
  id: 'ad-1',
  userId: 'user-1',
  title: 'لابتوب ديل مستعمل',
  description: 'جهاز نظيف بحالة ممتازة',
  city: 'غزة',
  price: 1500,
  categoryId: 'cat-1',
};

/** Default: no heuristics fire. */
function mockCleanSignals() {
  (fraudRepository.countRecentAdsByUser as jest.Mock).mockResolvedValue(1);
  (fraudRepository.getCategoryMedianPrice as jest.Mock).mockResolvedValue(null);
  (fraudRepository.findPotentialDuplicates as jest.Mock).mockResolvedValue([]);
  (fraudRepository.findUserCreatedAt as jest.Mock).mockResolvedValue(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  );
}

describe('fraudService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCleanSignals();
    (fraudRepository.setAdRiskScore as jest.Mock).mockResolvedValue(undefined);
    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        fraudSignal: {
          createMany: jest.fn().mockResolvedValue({ count: 0 }),
          create: jest.fn().mockResolvedValue({ id: 'sig-1' }),
        },
        ad: {
          findUnique: jest.fn().mockResolvedValue({ riskScore: 10 }),
          update: jest.fn().mockResolvedValue({}),
        },
      };
      return fn(tx);
    });
  });

  describe('scoreAd — clean listing', () => {
    it('persists riskScore 0 and does not flag when no signals fire', async () => {
      await fraudService.scoreAd(baseInput);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        0,
        false,
      );
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it('does not create FraudSignal rows when signals is empty', async () => {
      let createManyCalls = 0;
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          fraudSignal: {
            createMany: jest.fn().mockImplementation(() => {
              createManyCalls += 1;
              return Promise.resolve({ count: 0 });
            }),
          },
        };
        (fraudRepository.setAdRiskScore as jest.Mock).mockResolvedValue(undefined);
        return fn(tx);
      });

      await fraudService.scoreAd(baseInput);
      expect(createManyCalls).toBe(0);
    });
  });

  describe('scoreAd — RAPID_POSTING', () => {
    it('fires when recent posts exceed the configured max', async () => {
      const max = env.fraud.rapidPostingMaxPosts;
      (fraudRepository.countRecentAdsByUser as jest.Mock).mockResolvedValue(max + 3);

      await fraudService.scoreAd(baseInput);

      // weight = min(40, 15 + 3*5) = 30; threshold 60 → not flagged alone
      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        30,
        false,
      );
    });

    it('does not fire at or below the max', async () => {
      (fraudRepository.countRecentAdsByUser as jest.Mock).mockResolvedValue(
        env.fraud.rapidPostingMaxPosts,
      );

      await fraudService.scoreAd(baseInput);

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        0,
        false,
      );
    });
  });

  describe('scoreAd — SUSPICIOUS_PRICE', () => {
    it('flags price far below category median (ratio ≤ 0.15) with weight 30', async () => {
      (fraudRepository.getCategoryMedianPrice as jest.Mock).mockResolvedValue(1000);

      await fraudService.scoreAd({ ...baseInput, price: 100 }); // ratio 0.1

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        30,
        false,
      );
    });

    it('flags price far above category median (ratio ≥ 8) with weight 15', async () => {
      (fraudRepository.getCategoryMedianPrice as jest.Mock).mockResolvedValue(100);

      await fraudService.scoreAd({ ...baseInput, price: 900 }); // ratio 9

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        15,
        false,
      );
    });

    it('skips when price is null or categoryId is null', async () => {
      await fraudService.scoreAd({ ...baseInput, price: null });
      await fraudService.scoreAd({ ...baseInput, categoryId: null });

      expect(fraudRepository.getCategoryMedianPrice).not.toHaveBeenCalled();
    });

    it('skips when median is unavailable (thin category)', async () => {
      (fraudRepository.getCategoryMedianPrice as jest.Mock).mockResolvedValue(null);

      await fraudService.scoreAd({ ...baseInput, price: 1 });

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        0,
        false,
      );
    });
  });

  describe('scoreAd — SUSPICIOUS_CONTACT_PATTERN', () => {
    it('fires for a URL in title/description (weight 15)', async () => {
      await fraudService.scoreAd({
        ...baseInput,
        description: 'تواصل عبر https://wa.me/123456',
      });

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        15,
        false,
      );
    });

    it('fires for a phone-like run (weight 15)', async () => {
      await fraudService.scoreAd({
        ...baseInput,
        description: 'اتصل 0599123456 فوراً',
      });

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        15,
        false,
      );
    });

    it('uses weight 25 when both URL and phone-like text are present', async () => {
      await fraudService.scoreAd({
        ...baseInput,
        description: 'www.scam.example — 0599-123-456',
      });

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        25,
        false,
      );
    });
  });

  describe('scoreAd — SUSPICIOUS_KEYWORDS', () => {
    it('matches English scam phrasing (western union)', async () => {
      await fraudService.scoreAd({
        ...baseInput,
        description: 'Payment via Western Union only please',
      });

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        35,
        false,
      );
    });

    it('matches Arabic scam phrasing', async () => {
      await fraudService.scoreAd({
        ...baseInput,
        description: 'الدفع حوالة بنكية فقط قبل التسليم',
      });

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        35,
        false,
      );
    });
  });

  describe('scoreAd — DUPLICATE_LISTING', () => {
    it('fires when potential duplicates exist (weight 20)', async () => {
      (fraudRepository.findPotentialDuplicates as jest.Mock).mockResolvedValue([
        { id: 'ad-dup-1' },
      ]);

      await fraudService.scoreAd(baseInput);

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        20,
        false,
      );
    });
  });

  describe('scoreAd — NEW_ACCOUNT_HIGH_ACTIVITY', () => {
    it('only attaches when at least one other signal already fired', async () => {
      (fraudRepository.findPotentialDuplicates as jest.Mock).mockResolvedValue([
        { id: 'ad-dup-1' },
      ]);
      (fraudRepository.findUserCreatedAt as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 2 * 60 * 60 * 1000), // 2h old
      );

      await fraudService.scoreAd(baseInput);

      // DUPLICATE 20 + NEW_ACCOUNT 15 = 35
      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        35,
        false,
      );
    });

    it('does not attach when the account is older than the window', async () => {
      (fraudRepository.findPotentialDuplicates as jest.Mock).mockResolvedValue([
        { id: 'ad-dup-1' },
      ]);
      (fraudRepository.findUserCreatedAt as jest.Mock).mockResolvedValue(
        new Date(Date.now() - 48 * 60 * 60 * 1000),
      );

      await fraudService.scoreAd(baseInput);

      expect(fraudRepository.setAdRiskScore).toHaveBeenCalledWith(
        expect.anything(),
        'ad-1',
        20,
        false,
      );
    });

    it('does not query account age when no other signals fired', async () => {
      await fraudService.scoreAd(baseInput);
      expect(fraudRepository.findUserCreatedAt).not.toHaveBeenCalled();
    });
  });

  describe('scoreAd — auto-flag threshold', () => {
    it('sets flaggedForReview when cumulative weight ≥ autoFlagThreshold', async () => {
      // RAPID_POSTING max weight 40 + KEYWORDS 35 = 75 ≥ 60
      (fraudRepository.countRecentAdsByUser as jest.Mock).mockResolvedValue(
        env.fraud.rapidPostingMaxPosts + 10,
      );
      await fraudService.scoreAd({
        ...baseInput,
        description: 'Send deposit first via gift card',
      });

      const [, , riskScore, flagged] = (fraudRepository.setAdRiskScore as jest.Mock).mock
        .calls[0];
      expect(riskScore).toBeGreaterThanOrEqual(env.fraud.autoFlagThreshold);
      expect(flagged).toBe(true);
      expect(logger.warn).toHaveBeenCalledWith(
        'Ad auto-flagged for fraud review',
        expect.objectContaining({ adId: 'ad-1' }),
      );
    });

    it('caps riskScore at 100', async () => {
      (fraudRepository.countRecentAdsByUser as jest.Mock).mockResolvedValue(50);
      (fraudRepository.getCategoryMedianPrice as jest.Mock).mockResolvedValue(10000);
      (fraudRepository.findPotentialDuplicates as jest.Mock).mockResolvedValue([{ id: 'd1' }]);
      (fraudRepository.findUserCreatedAt as jest.Mock).mockResolvedValue(new Date());

      await fraudService.scoreAd({
        ...baseInput,
        price: 1,
        description: 'Western Union only https://pay.example 05991234567',
      });

      const riskScore = (fraudRepository.setAdRiskScore as jest.Mock).mock.calls[0][2];
      expect(riskScore).toBe(100);
    });
  });

  describe('scoreAd — fire-and-forget contract', () => {
    it('swallows repository errors and logs them (never throws)', async () => {
      (fraudRepository.countRecentAdsByUser as jest.Mock).mockRejectedValue(
        new Error('db down'),
      );

      await expect(fraudService.scoreAd(baseInput)).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Fraud scoring failed for ad — ad creation itself is unaffected',
        expect.objectContaining({ adId: 'ad-1', userId: 'user-1' }),
      );
    });

    it('swallows transaction failures the same way', async () => {
      (prisma.$transaction as jest.Mock).mockRejectedValue(new Error('tx failed'));

      await expect(fraudService.scoreAd(baseInput)).resolves.toBeUndefined();
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('getFlaggedAds / getSignals', () => {
    it('returns paginated flagged ads with default page/limit', async () => {
      (fraudRepository.findFlaggedAds as jest.Mock).mockResolvedValue({
        ads: [{ id: 'a1' }],
        total: 1,
      });

      const result = await fraudService.getFlaggedAds({} as any);

      expect(result.items).toHaveLength(1);
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(20);
      expect(result.meta.total).toBe(1);
    });

    it('returns paginated signals', async () => {
      (fraudRepository.findSignals as jest.Mock).mockResolvedValue({
        signals: [{ id: 's1' }],
        total: 5,
      });

      const result = await fraudService.getSignals({ page: 2, limit: 10 } as any);

      expect(result.items).toHaveLength(1);
      expect(result.meta.page).toBe(2);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.total).toBe(5);
    });
  });

  describe('reviewSignal', () => {
    it('throws NotFoundError when the signal does not exist', async () => {
      (fraudRepository.findSignalById as jest.Mock).mockResolvedValue(null);

      await expect(fraudService.reviewSignal('missing', 'admin-1')).rejects.toThrow(
        NotFoundError,
      );
    });

    it('marks the signal reviewed and writes an audit log', async () => {
      const existing = {
        id: 'sig-1',
        type: 'SUSPICIOUS_PRICE',
        adId: 'ad-1',
      };
      (fraudRepository.findSignalById as jest.Mock).mockResolvedValue(existing);
      (fraudRepository.markSignalReviewed as jest.Mock).mockResolvedValue({
        ...existing,
        reviewedAt: new Date(),
      });

      const updated = await fraudService.reviewSignal('sig-1', 'admin-1');

      expect(fraudRepository.markSignalReviewed).toHaveBeenCalledWith('sig-1', 'admin-1');
      expect(updated.id).toBe('sig-1');
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.ADMIN_FRAUD_SIGNAL_REVIEWED,
          userId: 'admin-1',
          details: expect.objectContaining({ signalId: 'sig-1' }),
        }),
      );
    });
  });

  describe('clearAdFlag', () => {
    it('clears the review flag and audits the action', async () => {
      (fraudRepository.clearAdFlag as jest.Mock).mockResolvedValue(undefined);

      await fraudService.clearAdFlag('ad-1', 'admin-1');

      expect(fraudRepository.clearAdFlag).toHaveBeenCalledWith('ad-1');
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.ADMIN_FRAUD_SIGNAL_REVIEWED,
          details: expect.objectContaining({ adId: 'ad-1', action: 'cleared_flag' }),
        }),
      );
    });
  });

  describe('manualFlag', () => {
    it('throws NotFoundError when the ad does not exist', async () => {
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          ad: { findUnique: jest.fn().mockResolvedValue(null) },
          fraudSignal: { create: jest.fn() },
        };
        return fn(tx);
      });

      await expect(
        fraudService.manualFlag(
          'missing',
          { weight: 40, reason: 'scam reports', userId: 'user-1' },
          'admin-1',
        ),
      ).rejects.toThrow(NotFoundError);
    });

    it('creates a MANUAL_ADMIN_FLAG signal and raises riskScore (capped at 100)', async () => {
      const create = jest.fn().mockResolvedValue({ id: 'sig-m' });
      const update = jest.fn().mockResolvedValue({});
      (prisma.$transaction as jest.Mock).mockImplementation(async (fn: (tx: any) => Promise<unknown>) => {
        const tx = {
          ad: {
            findUnique: jest.fn().mockResolvedValue({ riskScore: 80 }),
            update,
          },
          fraudSignal: { create },
        };
        return fn(tx);
      });

      await fraudService.manualFlag(
        'ad-1',
        { weight: 40, reason: 'multiple buyer reports', userId: 'user-1' },
        'admin-1',
      );

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'MANUAL_ADMIN_FLAG',
            weight: 40,
            adId: 'ad-1',
          }),
        }),
      );
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            flaggedForReview: true,
            riskScore: 100, // min(100, 80+40)
          }),
        }),
      );
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: AuditEvent.ADMIN_FRAUD_MANUAL_FLAG,
          userId: 'admin-1',
        }),
      );
    });
  });
});
