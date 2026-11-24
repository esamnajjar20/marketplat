import { favoritesController } from '../../src/modules/engagement/favorites/favorites.controller';
import { favoritesService } from '../../src/modules/engagement/favorites/favorites.service';
import { requireUser } from '../../src/shared/auth/requireUser';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/engagement/favorites/favorites.service');
jest.mock('../../src/shared/auth/requireUser');

describe('favoritesController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (requireUser as jest.Mock).mockReturnValue({ userId: 'u1', role: 'USER' });
  });

  it('toggleFavorite returns 200 for added action', async () => {
    (favoritesService.toggleFavorite as jest.Mock).mockResolvedValue({ action: 'added' });
    const res = mockResponse();
    await favoritesController.toggleFavorite(
      mockRequest({ params: { adId: 'ad-1' } }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(favoritesService.toggleFavorite).toHaveBeenCalledWith('u1', 'ad-1');
  });

  it('setFavoriteEntityState validates the desired state and returns 200', async () => {
    (favoritesService.setFavoriteEntityState as jest.Mock).mockResolvedValue({ action: 'added', isFavorited: true });
    const res = mockResponse();
    await favoritesController.setFavoriteEntityState(
      mockRequest({ params: { entityType: 'products', entityId: 'product-1' }, body: { favorited: true } }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(favoritesService.setFavoriteEntityState).toHaveBeenCalledWith('u1', 'PRODUCT', 'product-1', true);
  });

  it('rejects a non-boolean desired favorite state', async () => {
    const res = mockResponse();
    await favoritesController.setFavoriteEntityState(
      mockRequest({ params: { entityType: 'products', entityId: 'product-1' }, body: { favorited: 'yes' } }),
      res,
      mockNext(),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(favoritesService.setFavoriteEntityState).not.toHaveBeenCalled();
  });

  it('toggleFavorite returns removed message', async () => {
    (favoritesService.toggleFavorite as jest.Mock).mockResolvedValue({ action: 'removed' });
    const res = mockResponse();
    await favoritesController.toggleFavorite(
      mockRequest({ params: { adId: 'ad-1' } }),
      res,
      mockNext(),
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringMatching(/removed/i) }),
    );
  });

  it('forwards errors to next', async () => {
    (favoritesService.toggleFavorite as jest.Mock).mockRejectedValue(new Error('x'));
    const next = mockNext();
    await favoritesController.toggleFavorite(
      mockRequest({ params: { adId: 'ad-1' } }),
      mockResponse(),
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
