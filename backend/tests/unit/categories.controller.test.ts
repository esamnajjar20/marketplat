import { categoriesController } from '../../src/modules/categories/categories.controller';
import { categoriesService } from '../../src/modules/categories/categories.service';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/categories/categories.service');

const mockCategory = { id: 'cat-1', name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' } as any;

const validCreateBody = { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' };

describe('categoriesController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createCategory', () => {
    it('returns 201 with the created category on success', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.createCategory as jest.Mock).mockResolvedValue(mockCategory);

      await categoriesController.createCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockCategory })
      );
    });

    it('calls next(error) on validation failure (invalid slug format)', async () => {
      const req = mockRequest({ body: { ...validCreateBody, slug: 'Not Valid Slug!' } });
      const res = mockResponse();
      const next = mockNext();

      await categoriesController.createCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(categoriesService.createCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (name exists)', async () => {
      const req = mockRequest({ body: validCreateBody });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.createCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Category name already exists')
      );

      await categoriesController.createCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('getCategories', () => {
    it('returns 200 with the category list on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      const categories = [mockCategory];
      (categoriesService.getCategories as jest.Mock).mockResolvedValue(categories);

      await categoriesController.getCategories(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: categories })
      );
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.getCategories as jest.Mock).mockRejectedValue(new Error('DB error'));

      await categoriesController.getCategories(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getCategoryById', () => {
    it('returns 200 with the category on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.getCategoryById as jest.Mock).mockResolvedValue(mockCategory);

      await categoriesController.getCategoryById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true, data: mockCategory })
      );
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();
      const next = mockNext();

      await categoriesController.getCategoryById(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(categoriesService.getCategoryById).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.getCategoryById as jest.Mock).mockRejectedValue(
        new NotFoundError('Category not found')
      );

      await categoriesController.getCategoryById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getCategoryBySlug', () => {
    it('returns 200 with the category on success', async () => {
      const req = mockRequest({ params: { slug: 'electronics' } });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.getCategoryBySlug as jest.Mock).mockResolvedValue(mockCategory);

      await categoriesController.getCategoryBySlug(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(categoriesService.getCategoryBySlug).toHaveBeenCalledWith('electronics');
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { slug: 'missing-slug' } });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.getCategoryBySlug as jest.Mock).mockRejectedValue(
        new NotFoundError('Category not found')
      );

      await categoriesController.getCategoryBySlug(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateCategory', () => {
    it('returns 200 with the updated category on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { name: 'New Name' } });
      const res = mockResponse();
      const next = mockNext();
      const updated = { ...mockCategory, name: 'New Name' };
      (categoriesService.updateCategory as jest.Mock).mockResolvedValue(updated);

      await categoriesController.updateCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: updated }));
    });

    it('calls next(error) on validation failure (invalid slug format)', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { slug: 'Invalid Slug' } });
      const res = mockResponse();
      const next = mockNext();

      await categoriesController.updateCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(categoriesService.updateCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (slug conflict)', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { slug: 'taken-slug' } });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.updateCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Slug already in use')
      );

      await categoriesController.updateCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('deleteCategory', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.deleteCategory as jest.Mock).mockResolvedValue(undefined);

      await categoriesController.deleteCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('calls next(error) when the id param is missing', async () => {
      const req = mockRequest({ params: { id: '' } });
      const res = mockResponse();
      const next = mockNext();

      await categoriesController.deleteCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(categoriesService.deleteCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (category has active ads)', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (categoriesService.deleteCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Cannot delete category with 3 active ads')
      );

      await categoriesController.deleteCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });
});
