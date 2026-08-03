import { savedSearchesRepository } from '../../src/modules/saved-searches/saved-searches.repository';
import { prisma } from '../../src/config/prisma';

jest.mock('../../src/config/prisma', () => ({
  prisma: {
    savedSearch: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

describe('savedSearchesRepository', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('findManyByUserId', () => {
    it('queries by userId ordered by newest first', async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([]);
      await savedSearchesRepository.findManyByUserId('user-1');
      expect(prisma.savedSearch.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('countByUserId', () => {
    it('counts saved searches scoped to the given user', async () => {
      (prisma.savedSearch.count as jest.Mock).mockResolvedValue(3);
      const result = await savedSearchesRepository.countByUserId('user-1');
      expect(result).toBe(3);
      expect(prisma.savedSearch.count).toHaveBeenCalledWith({ where: { userId: 'user-1' } });
    });
  });

  describe('findById', () => {
    it('queries by id only', async () => {
      (prisma.savedSearch.findUnique as jest.Mock).mockResolvedValue(null);
      await savedSearchesRepository.findById('search-1');
      expect(prisma.savedSearch.findUnique).toHaveBeenCalledWith({ where: { id: 'search-1' } });
    });
  });

  describe('create', () => {
    it('creates with userId, label, and filters as JSON', async () => {
      const filters = { city: 'Gaza' };
      (prisma.savedSearch.create as jest.Mock).mockResolvedValue({ id: 'search-1' });

      await savedSearchesRepository.create('user-1', 'My search', filters as any);

      expect(prisma.savedSearch.create).toHaveBeenCalledWith({
        data: { userId: 'user-1', label: 'My search', filters },
      });
    });
  });

  describe('delete', () => {
    it('scopes the delete by both id and userId (IDOR-safe)', async () => {
      (prisma.savedSearch.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      await savedSearchesRepository.delete('search-1', 'user-1');

      expect(prisma.savedSearch.deleteMany).toHaveBeenCalledWith({
        where: { id: 'search-1', userId: 'user-1' },
      });
    });

    it('returns a count of 0 when nothing matched (wrong owner or missing id)', async () => {
      (prisma.savedSearch.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      const result = await savedSearchesRepository.delete('search-1', 'someone-else');

      expect(result.count).toBe(0);
    });
  });

  describe('findAllForMatching', () => {
    it('queries all saved searches unfiltered', async () => {
      (prisma.savedSearch.findMany as jest.Mock).mockResolvedValue([]);
      await savedSearchesRepository.findAllForMatching();
      expect(prisma.savedSearch.findMany).toHaveBeenCalledWith();
    });
  });

  describe('markNotified', () => {
    it('sets lastNotifiedAt for all given ids', async () => {
      (prisma.savedSearch.updateMany as jest.Mock).mockResolvedValue({ count: 2 });

      await savedSearchesRepository.markNotified(['search-1', 'search-2']);

      const call = (prisma.savedSearch.updateMany as jest.Mock).mock.calls[0][0];
      expect(call.where).toEqual({ id: { in: ['search-1', 'search-2'] } });
      expect(call.data.lastNotifiedAt).toBeInstanceOf(Date);
    });
  });
});
