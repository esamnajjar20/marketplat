import { savedSearchesController } from '../../src/modules/saved-searches/saved-searches.controller';
import { savedSearchesService } from '../../src/modules/saved-searches/saved-searches.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/saved-searches/saved-searches.service');
jest.mock('../../src/shared/utils/requireUser');

const mockSearch = { id: 'search-1', label: 'Cheap phones', filters: { city: 'Gaza' } } as any;

describe('savedSearchesController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('getMySavedSearches', () => {
    it('returns 200 with the list of saved searches', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (savedSearchesService.getMySavedSearches as jest.Mock).mockResolvedValue([mockSearch]);

      await savedSearchesController.getMySavedSearches(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [mockSearch] }));
      expect(savedSearchesService.getMySavedSearches).toHaveBeenCalledWith('user-1');
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await savedSearchesController.getMySavedSearches(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('createSavedSearch', () => {
    const validBody = { label: 'Cheap phones', filters: { city: 'Gaza' } };

    it('returns 201 with the created saved search', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (savedSearchesService.createSavedSearch as jest.Mock).mockResolvedValue(mockSearch);

      await savedSearchesController.createSavedSearch(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(savedSearchesService.createSavedSearch).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ label: 'Cheap phones' })
      );
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await savedSearchesController.createSavedSearch(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the label is missing', async () => {
      const req = mockRequest({ body: { filters: { city: 'Gaza' } } });
      const res = mockResponse();
      const next = mockNext();

      await savedSearchesController.createSavedSearch(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(savedSearchesService.createSavedSearch).not.toHaveBeenCalled();
    });

    it('calls next(error) when filters has no real criteria', async () => {
      const req = mockRequest({ body: { label: 'Empty filter', filters: {} } });
      const res = mockResponse();
      const next = mockNext();

      await savedSearchesController.createSavedSearch(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(savedSearchesService.createSavedSearch).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (limit reached)', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (savedSearchesService.createSavedSearch as jest.Mock).mockRejectedValue(
        new BadRequestError('You have reached the maximum number of saved searches (20).')
      );

      await savedSearchesController.createSavedSearch(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('deleteSavedSearch', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'search-1' } });
      const res = mockResponse();
      const next = mockNext();
      (savedSearchesService.deleteSavedSearch as jest.Mock).mockResolvedValue(undefined);

      await savedSearchesController.deleteSavedSearch(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(savedSearchesService.deleteSavedSearch).toHaveBeenCalledWith('search-1', 'user-1');
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'search-1' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await savedSearchesController.deleteSavedSearch(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws NotFoundError (wrong owner or missing)', async () => {
      const req = mockRequest({ params: { id: 'search-1' } });
      const res = mockResponse();
      const next = mockNext();
      (savedSearchesService.deleteSavedSearch as jest.Mock).mockRejectedValue(
        new NotFoundError('Saved search not found')
      );

      await savedSearchesController.deleteSavedSearch(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });

    it('calls next(error) for a missing id param', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await savedSearchesController.deleteSavedSearch(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(savedSearchesService.deleteSavedSearch).not.toHaveBeenCalled();
    });
  });
});
