import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoreCollections } from '@/components/stores/StoreCollections';
import { usePublicCollections, useCollectionProducts } from '@/hooks/queries/useCollections';
vi.mock('@/hooks/queries/useCollections', () => ({ usePublicCollections: vi.fn(), useCollectionProducts: vi.fn() }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('@/components/shared/ui/SafeImage', () => ({ SafeImage: () => <img alt="" /> }));
vi.mock('@/lib/cloudinary', () => ({ getThumbnailUrl: (u: string) => u, PLACEHOLDER_SVG: 'data:,' }));
vi.mock('@/lib/formatters', () => ({ formatPrice: (n: number) => `${n} ₪` }));
beforeEach(() => vi.clearAllMocks());
describe('StoreCollections', () => {
  it('null when empty', () => {
    vi.mocked(usePublicCollections).mockReturnValue({ data: [], isLoading: false } as any);
    expect(render(<StoreCollections storeId="s1" />).container.firstChild).toBeNull();
  });
  it('renders collection products', () => {
    vi.mocked(usePublicCollections).mockReturnValue({ data: [{ id: 'col-1', name: 'صيفي', imageUrl: null, _count: { products: 1 } }], isLoading: false } as any);
    vi.mocked(useCollectionProducts).mockReturnValue({ data: [{ id: 'prod-1', name: 'قميص', price: 50, images: [], availability: 'IN_STOCK' }], isLoading: false } as any);
    render(<StoreCollections storeId="store-1" />);
    expect(screen.getByText('صيفي')).toBeInTheDocument();
    expect(screen.getByText('قميص')).toBeInTheDocument();
  });
});
