/**
 * __tests__/components/search/SearchBox.test.tsx
 *
 * Covers components/search/SearchBox.tsx:
 *   - submit navigates to /search with q set (trimmed) and page removed,
 *     while preserving other existing filters already on the URL.
 *   - submitting an empty/whitespace query removes q instead of setting it.
 *   - the suggestions dropdown only shows after focus/typing, and
 *     selecting a suggestion updates the input, closes the dropdown, and
 *     navigates immediately with that suggestion (not the stale `value`).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBox } from '@/components/search/SearchBox';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

// SearchSuggestions is exercised in its own test file — stub it here so
// SearchBox's own navigation/submit logic is what's under test, and so
// we can assert exactly when it is/isn't rendered without depending on
// its internal debounce/query-gating behavior.
vi.mock('@/components/search/SearchSuggestions', () => ({
  SearchSuggestions: ({ query, onSelect }: { query: string; onSelect: (s: string) => void }) => (
    <div data-testid="suggestions" data-query={query}>
      <button type="button" onClick={() => onSelect('لابتوب مستعمل')}>
        pick-suggestion
      </button>
    </div>
  ),
}));

describe('SearchBox', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('navigates to /search with the trimmed query on submit', async () => {
    const user = userEvent.setup();
    render(<SearchBox />);

    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), '  لابتوب  ');
    await user.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(`${ROUTES.search}?q=%D9%84%D8%A7%D8%A8%D8%AA%D9%88%D8%A8`);
  });

  it('removes q instead of setting it when the query is empty', async () => {
    mockSearchParams = new URLSearchParams({ q: 'old', city: 'رام الله' });
    const user = userEvent.setup();
    render(<SearchBox defaultValue="old" />);

    await user.clear(screen.getByRole('searchbox', { name: 'بحث' }));
    await user.click(screen.getByRole('button', { name: 'بحث' }));

    const url = mockPush.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('q')).toBe(false);
    expect(params.get('city')).toBe('رام الله');
  });

  it('preserves existing filters and drops page on submit', async () => {
    mockSearchParams = new URLSearchParams({ city: 'نابلس', type: 'products', page: '3' });
    const user = userEvent.setup();
    render(<SearchBox />);

    await user.type(screen.getByRole('searchbox', { name: 'بحث' }), 'هاتف');
    await user.click(screen.getByRole('button', { name: 'بحث' }));

    const url = mockPush.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('city')).toBe('نابلس');
    expect(params.get('type')).toBe('products');
    expect(params.has('page')).toBe(false);
    expect(params.get('q')).toBe('هاتف');
  });

  it('does not show suggestions before the input is focused or typed into', () => {
    render(<SearchBox />);
    expect(screen.queryByTestId('suggestions')).not.toBeInTheDocument();
  });

  it('shows suggestions on focus', async () => {
    const user = userEvent.setup();
    render(<SearchBox />);

    await user.click(screen.getByRole('searchbox', { name: 'بحث' }));
    expect(screen.getByTestId('suggestions')).toBeInTheDocument();
  });

  it('selecting a suggestion updates the input, hides the dropdown, and navigates with that suggestion', async () => {
    const user = userEvent.setup();
    render(<SearchBox />);

    await user.click(screen.getByRole('searchbox', { name: 'بحث' }));
    await user.click(screen.getByText('pick-suggestion'));

    expect(mockPush).toHaveBeenCalledWith(`${ROUTES.search}?q=%D9%84%D8%A7%D8%A8%D8%AA%D9%88%D8%A8+%D9%85%D8%B3%D8%AA%D8%B9%D9%85%D9%84`);
    await waitFor(() => expect(screen.queryByTestId('suggestions')).not.toBeInTheDocument());
    expect(screen.getByRole('searchbox', { name: 'بحث' })).toHaveValue('لابتوب مستعمل');
  });
});
