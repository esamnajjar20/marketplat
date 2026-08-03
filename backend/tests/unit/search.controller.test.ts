import { searchController } from '../../src/modules/search/search.controller';
import { searchService } from '../../src/modules/search/search.service';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/search/search.service');

const mockResult = {
  results: [{ id: 'ad-1', type: 'ad', title: 'iPhone 13' }],
  pagination: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
} as any;

describe('searchController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('search', () => {
    it('returns 200 with results and pagination meta', async () => {
      const req = mockRequest({ query: { q: 'iphone' } });
      const res = mockResponse();
      const next = mockNext();
      (searchService.search as jest.Mock).mockResolvedValue(mockResult);

      await searchController.search(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: mockResult.results,
          meta: expect.objectContaining({ pagination: mockResult.pagination }),
        })
      );
    });

    it('parses and forwards default type=all and sort=relevance when omitted', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (searchService.search as jest.Mock).mockResolvedValue(mockResult);

      await searchController.search(req, res, next);

      expect(searchService.search).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'all', sort: 'relevance' })
      );
    });

    it('calls next(error) for an empty q string', async () => {
      const req = mockRequest({ query: { q: '' } });
      const res = mockResponse();
      const next = mockNext();

      await searchController.search(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('calls next(error) for an invalid type value', async () => {
      const req = mockRequest({ query: { type: 'bogus' } });
      const res = mockResponse();
      const next = mockNext();

      await searchController.search(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('calls next(error) for an invalid sort value', async () => {
      const req = mockRequest({ query: { sort: 'bogus' } });
      const res = mockResponse();
      const next = mockNext();

      await searchController.search(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(searchService.search).not.toHaveBeenCalled();
    });

    it('calls next(error) for a limit above 50', async () => {
      const req = mockRequest({ query: { limit: '51' } });
      const res = mockResponse();
      const next = mockNext();

      await searchController.search(req, res, next);

      expect(next).toHaveBeenCalled();
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (searchService.search as jest.Mock).mockRejectedValue(new Error('DB unavailable'));

      await searchController.search(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('suggest', () => {
    it('returns 200 with a suggestions array wrapped in an object', async () => {
      const req = mockRequest({ query: { q: 'iph' } });
      const res = mockResponse();
      const next = mockNext();
      (searchService.suggest as jest.Mock).mockResolvedValue(['iPhone 15']);

      await searchController.suggest(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ data: { suggestions: ['iPhone 15'] } })
      );
    });

    it('calls next(error) when q is missing', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();

      await searchController.suggest(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(searchService.suggest).not.toHaveBeenCalled();
    });

    it('calls next(error) when q is empty', async () => {
      const req = mockRequest({ query: { q: '' } });
      const res = mockResponse();
      const next = mockNext();

      await searchController.suggest(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(searchService.suggest).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest({ query: { q: 'iph' } });
      const res = mockResponse();
      const next = mockNext();
      (searchService.suggest as jest.Mock).mockRejectedValue(new Error('redis down'));

      await searchController.suggest(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
