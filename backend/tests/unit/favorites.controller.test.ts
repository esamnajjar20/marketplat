import { favoritesController } from '../../src/modules/favorites/favorites.controller';
import { favoritesService } from '../../src/modules/favorites/favorites.service';
import { requireUser } from '../../src/shared/utils/requireUser';
import { mockRequest, mockResponse, mockNext } from '../helpers/httpMocks.helper';

jest.mock('../../src/modules/favorites/favorites.service');
jest.mock('../../src/shared/utils/requireUser');

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
