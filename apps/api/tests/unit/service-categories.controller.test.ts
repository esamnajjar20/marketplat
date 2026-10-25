import { serviceCategoriesController } from '../../src/modules/service-categories/service-categories.controller';
import { serviceCategoriesService } from '../../src/modules/service-categories/service-categories.service';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/service-categories/service-categories.service');

const mockCategory = { id: 'cat-1', name: 'Plumbing', nameAr: 'سباكة', slug: 'plumbing' } as any;

describe('serviceCategoriesController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createServiceCategory', () => {
    it('returns 201 with the created category on success', async () => {
      const req = mockRequest({ body: { name: 'Plumbing', nameAr: 'سباكة', slug: 'plumbing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.createServiceCategory as jest.Mock).mockResolvedValue(mockCategory);

      await serviceCategoriesController.createServiceCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: mockCategory }));
    });

    it('calls next(error) for an invalid slug format', async () => {
      const req = mockRequest({
        body: { name: 'Plumbing', nameAr: 'سباكة', slug: 'Not A Valid Slug!' },
      });
      const res = mockResponse();
      const next = mockNext();

      await serviceCategoriesController.createServiceCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceCategoriesService.createServiceCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError', async () => {
      const req = mockRequest({ body: { name: 'Plumbing', nameAr: 'سباكة', slug: 'plumbing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.createServiceCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Service category name already exists')
      );

      await serviceCategoriesController.createServiceCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('getServiceCategories', () => {
    it('returns 200 with the category list on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.getServiceCategories as jest.Mock).mockResolvedValue([mockCategory]);

      await serviceCategoriesController.getServiceCategories(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [mockCategory] }));
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.getServiceCategories as jest.Mock).mockRejectedValue(
        new Error('DB unavailable')
      );

      await serviceCategoriesController.getServiceCategories(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getServiceCategoryById', () => {
    it('returns 200 with the category on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.getServiceCategoryById as jest.Mock).mockResolvedValue(mockCategory);

      await serviceCategoriesController.getServiceCategoryById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls next(error) for a missing id param', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await serviceCategoriesController.getServiceCategoryById(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceCategoriesService.getServiceCategoryById).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.getServiceCategoryById as jest.Mock).mockRejectedValue(
        new NotFoundError('Service category not found')
      );

      await serviceCategoriesController.getServiceCategoryById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getServiceCategoryBySlug', () => {
    it('returns 200 with the category on success (no Zod schema — reads params.slug directly)', async () => {
      const req = mockRequest({ params: { slug: 'plumbing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.getServiceCategoryBySlug as jest.Mock).mockResolvedValue(mockCategory);

      await serviceCategoriesController.getServiceCategoryBySlug(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(serviceCategoriesService.getServiceCategoryBySlug).toHaveBeenCalledWith('plumbing');
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { slug: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.getServiceCategoryBySlug as jest.Mock).mockRejectedValue(
        new NotFoundError('Service category not found')
      );

      await serviceCategoriesController.getServiceCategoryBySlug(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateServiceCategory', () => {
    it('returns 200 with the updated category on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { icon: 'wrench' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.updateServiceCategory as jest.Mock).mockResolvedValue({
        ...mockCategory,
        icon: 'wrench',
      });

      await serviceCategoriesController.updateServiceCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(serviceCategoriesService.updateServiceCategory).toHaveBeenCalledWith('cat-1', {
        icon: 'wrench',
      });
    });

    it('calls next(error) for an invalid isActive type', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { isActive: 'yes' } });
      const res = mockResponse();
      const next = mockNext();

      await serviceCategoriesController.updateServiceCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceCategoriesService.updateServiceCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { slug: 'taken-slug' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.updateServiceCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Slug already in use')
      );

      await serviceCategoriesController.updateServiceCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('deleteServiceCategory', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.deleteServiceCategory as jest.Mock).mockResolvedValue(undefined);

      await serviceCategoriesController.deleteServiceCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(serviceCategoriesService.deleteServiceCategory).toHaveBeenCalledWith('cat-1');
    });

    it('calls next(error) for a missing id param', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await serviceCategoriesController.deleteServiceCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(serviceCategoriesService.deleteServiceCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (active listings exist)', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (serviceCategoriesService.deleteServiceCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Cannot delete category with 3 active listings')
      );

      await serviceCategoriesController.deleteServiceCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });
});
