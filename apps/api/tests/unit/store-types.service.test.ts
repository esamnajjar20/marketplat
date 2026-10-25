import { storeTypesService } from '../../src/modules/store-types/store-types.service';
import { storeTypesRepository } from '../../src/modules/store-types/store-types.repository';
import { redis } from '../../src/config/redis';
import { bumpPublicListCache } from '../../src/shared/utils/publicListCache';

jest.mock('../../src/modules/store-types/store-types.repository');
jest.mock('../../src/shared/utils/publicListCache', () => ({
  bumpPublicListCache: jest.fn().mockResolvedValue(undefined),
}));

describe('storeTypesService', () => {
  const labels = {
    products: 'المنتجات',
    product: 'منتج',
    addProduct: 'أضف منتجًا',
    categories: 'التصنيفات',
  };

  const type = {
    id: 'st_general',
    slug: 'general',
    nameAr: 'عام',
    icon: 'Store',
    labels,
    freeProductLimit: 20,
    isActive: true,
    sortOrder: 0,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(redis, 'get').mockResolvedValue(null);
    jest.spyOn(redis, 'setex').mockResolvedValue('OK');
    jest.spyOn(redis, 'del').mockResolvedValue(1);
  });

  it('returns cached active store types without querying the database', async () => {
    const cached = [{ id: type.id, slug: type.slug, nameAr: type.nameAr, icon: type.icon, labels, hasActiveStores: false }];
    (redis.get as jest.Mock).mockResolvedValue(JSON.stringify(cached));

    await expect(storeTypesService.getActive()).resolves.toEqual(cached);
    expect(storeTypesRepository.findActive).not.toHaveBeenCalled();
  });

  it('maps active-store presence into the public DTO', async () => {
    (storeTypesRepository.findActive as jest.Mock).mockResolvedValue([
      { ...type, _count: { stores: 2 } },
    ]);

    const result = await storeTypesService.getActive();

    expect(result[0]).toEqual({
      id: 'st_general',
      slug: 'general',
      nameAr: 'عام',
      icon: 'Store',
      labels,
      hasActiveStores: true,
    });
  });

  it('invalidates public caches when a StoreType is edited', async () => {
    (storeTypesRepository.findById as jest.Mock).mockResolvedValue(type);
    (storeTypesRepository.update as jest.Mock).mockResolvedValue(type);

    await storeTypesService.update(type.id, { nameAr: 'عام' });

    expect(redis.del).toHaveBeenCalledWith('store_types:active:v1');
    expect(bumpPublicListCache).toHaveBeenCalledWith('stores');
  });
});
