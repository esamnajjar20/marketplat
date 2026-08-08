import { reportsService } from '../../src/modules/reports/reports.service';
import { reportsRepository } from '../../src/modules/reports/reports.repository';
import { adsService } from '../../src/modules/ads/ads.service';
import { usersService } from '../../src/modules/users';
import { storesService } from '../../src/modules/stores';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/reports/reports.repository');
jest.mock('../../src/modules/ads/ads.service');
jest.mock('../../src/modules/users');
jest.mock('../../src/modules/stores');

const mockAd = { id: 'ad-1', userId: 'owner-1', status: 'ACTIVE' };
const mockReport = {
  id: 'report-1',
  userId: 'reporter-1',
  targetType: 'AD',
  targetId: 'ad-1',
  adId: 'ad-1',
  reason: 'SCAM',
  status: 'PENDING',
};

describe('ReportsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createReport', () => {
    it('creates report successfully', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(mockAd);
      (reportsRepository.findByUserAndTarget as jest.Mock).mockResolvedValue(null);
      (reportsRepository.create as jest.Mock).mockResolvedValue(mockReport);

      const result = await reportsService.createReport('reporter-1', 'ad-1', {
        reason: 'SCAM',
        notes: 'test',
      });
      expect(result.id).toBe('report-1');
      expect(reportsRepository.create).toHaveBeenCalledWith(
        'reporter-1',
        'AD',
        'ad-1',
        'SCAM',
        'test'
      );
    });

    it('throws when ad not found', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(null);
      await expect(
        reportsService.createReport('reporter-1', 'missing', { reason: 'SPAM' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws when reporting own ad', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue({ ...mockAd, userId: 'user-1' });
      await expect(
        reportsService.createReport('user-1', 'ad-1', { reason: 'SPAM' })
      ).rejects.toThrow(BadRequestError);
    });

    it('throws on duplicate report', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(mockAd);
      (reportsRepository.findByUserAndTarget as jest.Mock).mockResolvedValue(mockReport);
      await expect(
        reportsService.createReport('reporter-1', 'ad-1', { reason: 'SPAM' })
      ).rejects.toThrow(/already reported/);
    });
  });

  // FEAT-REPORT-USER-STORE
  describe('createTargetReport — USER', () => {
    const mockTargetUser = { id: 'target-user-1', name: 'Target' };

    it('creates a report against a user', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockTargetUser);
      (reportsRepository.findByUserAndTarget as jest.Mock).mockResolvedValue(null);
      (reportsRepository.create as jest.Mock).mockResolvedValue({
        ...mockReport,
        targetType: 'USER',
        targetId: 'target-user-1',
        adId: null,
      });

      const result = await reportsService.createTargetReport(
        'reporter-1',
        'USER',
        'target-user-1',
        { reason: 'OFFENSIVE' }
      );
      expect(result.targetType).toBe('USER');
      expect(reportsRepository.create).toHaveBeenCalledWith(
        'reporter-1',
        'USER',
        'target-user-1',
        'OFFENSIVE',
        undefined
      );
    });

    it('propagates NotFoundError when target user does not exist', async () => {
      (usersService.getUserById as jest.Mock).mockRejectedValue(
        new NotFoundError('User not found')
      );
      await expect(
        reportsService.createTargetReport('reporter-1', 'USER', 'missing', { reason: 'SPAM' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws when reporting yourself', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue({ id: 'user-1' });
      await expect(
        reportsService.createTargetReport('user-1', 'USER', 'user-1', { reason: 'SPAM' })
      ).rejects.toThrow(BadRequestError);
    });

    it('throws on duplicate report', async () => {
      (usersService.getUserById as jest.Mock).mockResolvedValue(mockTargetUser);
      (reportsRepository.findByUserAndTarget as jest.Mock).mockResolvedValue(mockReport);
      await expect(
        reportsService.createTargetReport('reporter-1', 'USER', 'target-user-1', {
          reason: 'SPAM',
        })
      ).rejects.toThrow(/already reported/);
    });
  });

  // FEAT-REPORT-USER-STORE
  describe('createTargetReport — STORE', () => {
    const mockStore = {
      id: 'store-1',
      sellerProfile: { id: 'seller-1', userId: 'seller-user-1' },
    };

    it('creates a report against a store', async () => {
      (storesService.findStoreForReference as jest.Mock).mockResolvedValue(mockStore);
      (reportsRepository.findByUserAndTarget as jest.Mock).mockResolvedValue(null);
      (reportsRepository.create as jest.Mock).mockResolvedValue({
        ...mockReport,
        targetType: 'STORE',
        targetId: 'store-1',
        adId: null,
      });

      const result = await reportsService.createTargetReport('reporter-1', 'STORE', 'store-1', {
        reason: 'FAKE',
      });
      expect(result.targetType).toBe('STORE');
    });

    it('throws when store not found', async () => {
      (storesService.findStoreForReference as jest.Mock).mockResolvedValue(null);
      await expect(
        reportsService.createTargetReport('reporter-1', 'STORE', 'missing', { reason: 'SPAM' })
      ).rejects.toThrow(NotFoundError);
    });

    it('throws when the seller reports their own store', async () => {
      (storesService.findStoreForReference as jest.Mock).mockResolvedValue(mockStore);
      await expect(
        reportsService.createTargetReport('seller-user-1', 'STORE', 'store-1', {
          reason: 'SPAM',
        })
      ).rejects.toThrow(BadRequestError);
    });
  });

  // FEAT-REPORT-USER-STORE
  describe('getMyReports', () => {
    it("returns the reporter's own reports, paginated", async () => {
      (reportsRepository.findManyByReporter as jest.Mock).mockResolvedValue({
        reports: [mockReport],
        total: 1,
      });
      const result = await reportsService.getMyReports('reporter-1', { page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
      expect(reportsRepository.findManyByReporter).toHaveBeenCalledWith('reporter-1', {
        page: 1,
        limit: 10,
      });
    });
  });

  describe('getReportById', () => {
    it('returns report when found', async () => {
      (reportsRepository.findById as jest.Mock).mockResolvedValue(mockReport);
      const result = await reportsService.getReportById('report-1');
      expect(result.id).toBe('report-1');
    });

    it('throws when not found', async () => {
      (reportsRepository.findById as jest.Mock).mockResolvedValue(null);
      await expect(reportsService.getReportById('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateReportStatus', () => {
    it('updates status', async () => {
      (reportsRepository.findById as jest.Mock).mockResolvedValue(mockReport);
      (reportsRepository.updateStatus as jest.Mock).mockResolvedValue({ ...mockReport, status: 'RESOLVED' });

      const result = await reportsService.updateReportStatus('report-1', { status: 'RESOLVED' });
      expect(result.status).toBe('RESOLVED');
    });
  });

  describe('getReports', () => {
    it('returns paginated reports', async () => {
      (reportsRepository.findMany as jest.Mock).mockResolvedValue({ reports: [mockReport], total: 1 });
      const result = await reportsService.getReports({ page: 1, limit: 10 });
      expect(result.items).toHaveLength(1);
    });
  });
});
