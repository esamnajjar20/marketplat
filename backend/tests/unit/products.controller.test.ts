import { productsController } from '../../src/modules/products/products.controller';
import { productsService } from '../../src/modules/products/products.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';
import { ForbiddenError } from '../../src/shared/errors/ForbiddenError';
import { BadRequestError } from '../../src/shared/errors/BadRequestError';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/products/products.service');
jest.mock('../../src/shared/utils/requireUser');

const mockProduct = { id: 'product-1', name: 'Phone', status: 'ACTIVE' } as any;

const validBody = {
  categoryId: 'cat-1',
  name: 'Phone',
  description: 'A long enough description',
  price: 100,
};

describe('productsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'user-1' });
  });

  describe('createProduct', () => {
    it('returns 201 with the created product, passing req.files through', async () => {
      const files = [{ buffer: Buffer.from('x') }];
      const req = mockRequest({ body: validBody, files } as any);
      const res = mockResponse();
      const next = mockNext();
      (productsService.createProduct as jest.Mock).mockResolvedValue(mockProduct);

      await productsController.createProduct(req, res, next);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(productsService.createProduct).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ name: 'Phone' }),
        files
      );
    });

    it('defaults files to an empty array when req.files is undefined', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (productsService.createProduct as jest.Mock).mockResolvedValue(mockProduct);

      await productsController.createProduct(req, res, next);

      expect(productsService.createProduct).toHaveBeenCalledWith('user-1', expect.anything(), []);
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await productsController.createProduct(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the description is too short', async () => {
      const req = mockRequest({ body: { ...validBody, description: 'short' } });
      const res = mockResponse();
      const next = mockNext();

      await productsController.createProduct(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(productsService.createProduct).not.toHaveBeenCalled();
    });

    it('calls next(error) when the service throws ForbiddenError', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (productsService.createProduct as jest.Mock).mockRejectedValue(
        new ForbiddenError('Your store must be approved first')
      );

      await productsController.createProduct(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next(error) when the service throws BadRequestError (plan limit)', async () => {
      const req = mockRequest({ body: validBody });
      const res = mockResponse();
      const next = mockNext();
      (productsService.createProduct as jest.Mock).mockRejectedValue(
        new BadRequestError('Free plan stores can list up to 20 products.')
      );

      await productsController.createProduct(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  describe('getMyProducts', () => {
    it('returns 200 with items and pagination meta', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (productsService.getMyProducts as jest.Mock).mockResolvedValue({
        items: [mockProduct],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await productsController.getMyProducts(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ meta: expect.objectContaining({ pagination: expect.anything() }) })
      );
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ query: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await productsController.getMyProducts(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) for an out-of-range page', async () => {
      const req = mockRequest({ query: { page: '0' } });
      const res = mockResponse();
      const next = mockNext();

      await productsController.getMyProducts(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(productsService.getMyProducts).not.toHaveBeenCalled();
    });
  });

  describe('getProducts', () => {
    it('returns 200 with items and pagination meta (no auth required)', async () => {
      const req = mockRequest({ query: { categoryId: 'cat-1' } });
      const res = mockResponse();
      const next = mockNext();
      (productsService.getProducts as jest.Mock).mockResolvedValue({
        items: [mockProduct],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      });

      await productsController.getProducts(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(requireUser).not.toHaveBeenCalled();
    });

    it('calls next(error) for an invalid sortBy value', async () => {
      const req = mockRequest({ query: { sortBy: 'bogus' } });
      const res = mockResponse();
      const next = mockNext();

      await productsController.getProducts(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(productsService.getProducts).not.toHaveBeenCalled();
    });

    it('calls next(error) for an invalid availability value', async () => {
      const req = mockRequest({ query: { availability: 'BOGUS' } });
      const res = mockResponse();
      const next = mockNext();

      await productsController.getProducts(req, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('getProductById', () => {
    it('returns 200 with the product on success', async () => {
      const req = mockRequest({ params: { id: 'product-1' } });
      const res = mockResponse();
      const next = mockNext();
      (productsService.getProductById as jest.Mock).mockResolvedValue(mockProduct);

      await productsController.getProductById(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (productsService.getProductById as jest.Mock).mockRejectedValue(
        new NotFoundError('Product not found')
      );

      await productsController.getProductById(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('updateProduct', () => {
    it('returns 200 with the updated product on success', async () => {
      const req = mockRequest({ params: { id: 'product-1' }, body: { name: 'New name' } });
      const res = mockResponse();
      const next = mockNext();
      (productsService.updateProduct as jest.Mock).mockResolvedValue({
        ...mockProduct,
        name: 'New name',
      });

      await productsController.updateProduct(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(productsService.updateProduct).toHaveBeenCalledWith('user-1', 'product-1', {
        name: 'New name',
      });
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'product-1' }, body: {} });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await productsController.updateProduct(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws ForbiddenError (IDOR)', async () => {
      const req = mockRequest({ params: { id: 'product-1' }, body: { name: 'Updated' } });
      const res = mockResponse();
      const next = mockNext();
      (productsService.updateProduct as jest.Mock).mockRejectedValue(
        new ForbiddenError('You do not own this product.')
      );

      await productsController.updateProduct(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('deleteProduct', () => {
    it('returns 200 on success', async () => {
      const req = mockRequest({ params: { id: 'product-1' } });
      const res = mockResponse();
      const next = mockNext();
      (productsService.deleteProduct as jest.Mock).mockResolvedValue(undefined);

      await productsController.deleteProduct(req, res, next);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(productsService.deleteProduct).toHaveBeenCalledWith('user-1', 'product-1');
    });

    it('calls next(error) when unauthenticated', async () => {
      const req = mockRequest({ params: { id: 'product-1' } });
      const res = mockResponse();
      const next = mockNext();
      (requireUser as jest.Mock).mockImplementation(() => {
        throw new UnauthorizedError();
      });

      await productsController.deleteProduct(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('calls next(error) when the service throws NotFoundError', async () => {
      const req = mockRequest({ params: { id: 'missing' } });
      const res = mockResponse();
      const next = mockNext();
      (productsService.deleteProduct as jest.Mock).mockRejectedValue(
        new NotFoundError('Product not found')
      );

      await productsController.deleteProduct(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });
});
