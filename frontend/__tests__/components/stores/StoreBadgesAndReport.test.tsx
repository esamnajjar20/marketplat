import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StoreBadges } from '@/components/stores/StoreBadges';
import { ReportStoreButton } from '@/components/stores/ReportStoreButton';
import { useStoreBadges } from '@/hooks/queries/useBadges';
import { useReportStore } from '@/hooks/mutations/useReportMutations';
vi.mock('@/hooks/queries/useBadges', () => ({ useStoreBadges: vi.fn() }));
vi.mock('@/hooks/mutations/useReportMutations', () => ({ useReportStore: vi.fn() }));
vi.mock('@/components/shared/ReportButton', () => ({ ReportButton: (p: any) => <button data-testid="report-btn">{p.triggerLabel}</button> }));
vi.mock('@/components/shared/ui/Badge', () => ({ Badge: ({ children }: any) => <span>{children}</span> }));
beforeEach(() => vi.clearAllMocks());
describe('StoreBadges', () => {
  it('null when empty', () => {
    vi.mocked(useStoreBadges).mockReturnValue({ data: [] } as any);
    expect(render(<StoreBadges storeId="s1" />).container.firstChild).toBeNull();
  });
  it('renders labels', () => {
    vi.mocked(useStoreBadges).mockReturnValue({ data: [{ type: 'VERIFIED', icon: '✓', label: 'موثّق' }] } as any);
    render(<StoreBadges storeId="s1" />);
    expect(screen.getByText('موثّق')).toBeInTheDocument();
  });
});
describe('ReportStoreButton', () => {
  it('wires mutation', () => {
    vi.mocked(useReportStore).mockReturnValue({ mutate: vi.fn() } as any);
    render(<ReportStoreButton storeId="store-9" />);
    expect(useReportStore).toHaveBeenCalledWith('store-9');
    expect(screen.getByTestId('report-btn')).toHaveTextContent('الإبلاغ عن هذا المتجر');
  });
});
