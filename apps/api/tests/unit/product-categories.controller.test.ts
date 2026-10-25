import { productCategoriesController } from '../../src/modules/product-categories/product-categories.controller';
import { productCategoriesService } from '../../src/modules/product-categories/product-categories.service';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/product-categories/product-categories.service');

const mockCategory = {
  id: 'cat-1',
  name: 'Electronics',
  nameAr: 'إلكترونيات',
  slug: 'electronics',
} as any;

describe('productCategoriesController', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createProductCategory', () => {
    it('returns 201 with the created category on success', async () => {
      const req = mockRequest({
        body: { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' },
      });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.createProductCategory as jest.Mock).mockResolvedValue(
        mockCategory
      );

      await productCategoriesController.createProductCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: mockCategory }));
    });

    it('calls next(error) for an invalid slug format', async () => {
      const req = mockRequest({
        body: { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'Not A Valid Slug!' },
      });
      const res = mockResponse();
      const next = mockNext();

      await productCategoriesController.createProductCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(productCategoriesService.createProductCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError', async () => {
      const req = mockRequest({
        body: { name: 'Electronics', nameAr: 'إلكترونيات', slug: 'electronics' },
      });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.createProductCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Product category name already exists')
      );

      await productCategoriesController.createProductCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('getProductCategories', () => {
    it('returns 200 with the category list on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.getProductCategories as jest.Mock).mockResolvedValue([
        mockCategory,
      ]);

      await productCategoriesController.getProductCategories(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [mockCategory] }));
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.getProductCategories as jest.Mock).mockRejectedValue(
        new Error('DB unavailable')
      );

      await productCategoriesController.getProductCategories(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getProductCategoriesForAdmin', () => {
    it('returns 200 with the admin category list on success', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.getProductCategoriesForAdmin as jest.Mock).mockResolvedValue([
        mockCategory,
      ]);

      await productCategoriesController.getProductCategoriesForAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ data: [mockCategory] }));
    });

    it('calls next(error) when the service throws', async () => {
      const req = mockRequest();
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.getProductCategoriesForAdmin as jest.Mock).mockRejectedValue(
        new Error('DB unavailable')
      );

      await productCategoriesController.getProductCategoriesForAdmin(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('getProductCategoryById', () => {
    it('returns 200 with the category on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.getProductCategoryById as jest.Mock).mockResolvedValue(
        mockCategory
      );

      await productCategoriesController.getProductCategoryById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls next(error) for a missing id param', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await productCategoriesController.getProductCategoryById(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(productCategoriesService.getProductCategoryById).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.getProductCategoryById as jest.Mock).mockRejectedValue(
        new NotFoundError('Product category not found')
      );

      await productCategoriesController.getProductCategoryById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('getProductCategoryBySlug', () => {
    it('returns 200 with the category on success (no Zod schema — reads params.slug directly)', async () => {
      const req = mockRequest({ params: { slug: 'electronics' } });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.getProductCategoryBySlug as jest.Mock).mockResolvedValue(
        mockCategory
      );

      await productCategoriesController.getProductCategoryBySlug(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(productCategoriesService.getProductCategoryBySlug).toHaveBeenCalledWith(
        'electronics'
      );
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { slug: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.getProductCategoryBySlug as jest.Mock).mockRejectedValue(
        new NotFoundError('Product category not found')
      );

      await productCategoriesController.getProductCategoryBySlug(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateProductCategory', () => {
    it('returns 200 with the updated category on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { icon: 'phone-icon' } });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.updateProductCategory as jest.Mock).mockResolvedValue({
        ...mockCategory,
        icon: 'phone-icon',
      });

      await productCategoriesController.updateProductCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(productCategoriesService.updateProductCategory).toHaveBeenCalledWith('cat-1', {
        icon: 'phone-icon',
      });
    });

    it('calls next(error) for an invalid isActive type', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { isActive: 'yes' } });
      const res = mockResponse();
      const next = mockNext();

      await productCategoriesController.updateProductCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(productCategoriesService.updateProductCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError', async () => {
      const req = mockRequest({ params: { id: 'cat-1' }, body: { slug: 'taken-slug' } });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.updateProductCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Slug already in use')
      );

      await productCategoriesController.updateProductCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('deleteProductCategory', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.deleteProductCategory as jest.Mock).mockResolvedValue(undefined);

      await productCategoriesController.deleteProductCategory(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(productCategoriesService.deleteProductCategory).toHaveBeenCalledWith('cat-1');
    });

    it('calls next(error) for a missing id param', async () => {
      const req = mockRequest({ params: {} });
      const res = mockResponse();
      const next = mockNext();

      await productCategoriesController.deleteProductCategory(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(productCategoriesService.deleteProductCategory).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws BadRequestError (active products exist)', async () => {
      const req = mockRequest({ params: { id: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (productCategoriesService.deleteProductCategory as jest.Mock).mockRejectedValue(
        new BadRequestError('Cannot delete category with 3 active products')
      );

      await productCategoriesController.deleteProductCategory(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });
});
