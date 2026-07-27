import { reportsService } from '../../src/modules/reports/reports.service';
import { reportsRepository } from '../../src/modules/reports/reports.repository';
import { adsService } from '../../src/modules/ads/ads.service';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';

jest.mock('../../src/modules/reports/reports.repository');
jest.mock('../../src/modules/ads/ads.service');

const mockAd = { id: 'ad-1', userId: 'owner-1', status: 'ACTIVE' };
const mockReport = {
  id: 'report-1',
  userId: 'reporter-1',
  adId: 'ad-1',
  reason: 'SCAM',
  status: 'PENDING',
};

describe('ReportsService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createReport', () => {
    it('creates report successfully', async () => {
      (adsService.findAdForReference as jest.Mock).mockResolvedValue(mockAd);
      (reportsRepository.findByUserAndAd as jest.Mock).mockResolvedValue(null);
      (reportsRepository.create as jest.Mock).mockResolvedValue(mockReport);

      const result = await reportsService.createReport('reporter-1', 'ad-1', {
        reason: 'SCAM',
        notes: 'test',
      });
      expect(result.id).toBe('report-1');
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
      (reportsRepository.findByUserAndAd as jest.Mock).mockResolvedValue(mockReport);
      await expect(
        reportsService.createReport('reporter-1', 'ad-1', { reason: 'SPAM' })
      ).rejects.toThrow(/already reported/);
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
