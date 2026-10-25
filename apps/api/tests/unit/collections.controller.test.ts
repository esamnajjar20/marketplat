import { collectionsController } from '../../src/modules/collections/collections.controller';
import { collectionsService } from '../../src/modules/collections/collections.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/collections/collections.service');
jest.mock('../../src/shared/utils/requireUser');

const userId = 'user-1';

describe('collectionsController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId, role: 'USER' });
  });

  it('createCollection returns 201', async () => {
    (collectionsService.createCollection as jest.Mock).mockResolvedValue({ id: 'c1' });
    const res = mockResponse();
    await collectionsController.createCollection(
      mockRequest({ body: { name: 'مجموعة' } }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(collectionsService.createCollection).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ name: 'مجموعة' }),
    );
  });

  it('getMyCollections returns 200', async () => {
    (collectionsService.getMyCollections as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();
    await collectionsController.getMyCollections(mockRequest(), res, mockNext());
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('getCollectionById returns 200', async () => {
    (collectionsService.getCollectionById as jest.Mock).mockResolvedValue({ id: 'c1' });
    const res = mockResponse();
    await collectionsController.getCollectionById(
      mockRequest({ params: { id: 'c1' } }),
      res,
      mockNext(),
    );
    expect(collectionsService.getCollectionById).toHaveBeenCalledWith(userId, 'c1');
  });

  it('updateCollection returns 200', async () => {
    (collectionsService.updateCollection as jest.Mock).mockResolvedValue({ id: 'c1' });
    const res = mockResponse();
    await collectionsController.updateCollection(
      mockRequest({ params: { id: 'c1' }, body: { name: 'جديد' } }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('deleteCollection returns 200', async () => {
    (collectionsService.deleteCollection as jest.Mock).mockResolvedValue(undefined);
    const res = mockResponse();
    await collectionsController.deleteCollection(
      mockRequest({ params: { id: 'c1' } }),
      res,
      mockNext(),
    );
    expect(collectionsService.deleteCollection).toHaveBeenCalledWith(userId, 'c1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('reorderCollections returns 200', async () => {
    (collectionsService.reorderCollections as jest.Mock).mockResolvedValue(undefined);
    const res = mockResponse();
    await collectionsController.reorderCollections(
      mockRequest({ body: { orderedIds: ['c1', 'c2'] } }),
      res,
      mockNext(),
    );
    expect(collectionsService.reorderCollections).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ orderedIds: ['c1', 'c2'] }),
    );
  });

  it('getPublicCollections returns 200', async () => {
    (collectionsService.getPublicCollections as jest.Mock).mockResolvedValue([]);
    const res = mockResponse();
    await collectionsController.getPublicCollections(
      mockRequest({ params: { storeId: 'store-1' } }),
      res,
      mockNext(),
    );
    expect(collectionsService.getPublicCollections).toHaveBeenCalledWith('store-1');
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('forwards errors to next', async () => {
    (collectionsService.getMyCollections as jest.Mock).mockRejectedValue(new Error('x'));
    const next = mockNext();
    await collectionsController.getMyCollections(mockRequest(), mockResponse(), next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
