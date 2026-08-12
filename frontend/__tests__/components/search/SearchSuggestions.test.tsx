/**
 * __tests__/components/search/SearchSuggestions.test.tsx
 *
 * Covers components/search/SearchSuggestions.tsx:
 *   - renders nothing below the 2-char minimum, regardless of hook state.
 *   - debounces the raw `query` prop by 300ms before it reaches
 *     useSearchSuggestions (the hook itself is mocked here, so this
 *     verifies SearchSuggestions' own local useDebouncedValue wiring).
 *   - loading / empty / populated states.
 *   - clicking an option calls onSelect with that suggestion.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchSuggestions } from '@/components/search/SearchSuggestions';
import { useSearchSuggestions } from '@/hooks/queries/useSearch';

vi.mock('@/hooks/queries/useSearch', () => ({
  useSearchSuggestions: vi.fn(),
}));

function mockHook(data: string[] | undefined, isFetching: boolean) {
  vi.mocked(useSearchSuggestions).mockReturnValue({ data, isFetching } as never);
}

describe('SearchSuggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing when the trimmed query is shorter than 2 characters', () => {
    mockHook(['x'], false);
    const { container } = render(<SearchSuggestions query=" a " onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('debounces the query passed to useSearchSuggestions by 300ms', () => {
    mockHook([], false);
    const { rerender } = render(<SearchSuggestions query="لا" onSelect={vi.fn()} />);

    // Immediately after mount, the hook should still have been called
    // with the initial value (debounced value starts equal to query).
    expect(useSearchSuggestions).toHaveBeenLastCalledWith('لا');

    // act() flushes the resulting effect synchronously (registering the
    // new setTimeout and cleaning up the old one) before we assert or
    // advance timers — without it, the effect can still be pending when
    // the next assertion runs under fake timers.
    act(() => {
      rerender(<SearchSuggestions query="لاب" onSelect={vi.fn()} />);
    });
    // Right after the prop changes, the debounced value hasn't updated
    // yet, so the hook is still called with the OLD value on this render.
    expect(useSearchSuggestions).toHaveBeenLastCalledWith('لا');
    expect(useSearchSuggestions).not.toHaveBeenCalledWith('لاب');

    // Once the debounce window elapses, the internal state update
    // re-renders the component with the new debounced value.
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(useSearchSuggestions).toHaveBeenLastCalledWith('لاب');
  });

  it('shows a loading indicator while fetching with no suggestions yet', () => {
    mockHook(undefined, true);
    render(<SearchSuggestions query="لابتوب" onSelect={vi.fn()} />);
    expect(screen.getByText('جارٍ البحث...')).toBeInTheDocument();
  });

  it('renders nothing once fetching finishes with an empty result', () => {
    mockHook([], false);
    const { container } = render(<SearchSuggestions query="لابتوب" onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders each suggestion as an option', () => {
    mockHook(['لابتوب ديل', 'لابتوب اتش بي'], false);
    render(<SearchSuggestions query="لابتوب" onSelect={vi.fn()} />);

    expect(screen.getByRole('listbox', { name: 'اقتراحات البحث' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /لابتوب ديل/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /لابتوب اتش بي/ })).toBeInTheDocument();
  });

  it('calls onSelect with the clicked suggestion', async () => {
    vi.useRealTimers();
    mockHook(['لابتوب ديل'], false);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<SearchSuggestions query="لابتوب" onSelect={onSelect} />);

    await user.click(screen.getByRole('option', { name: /لابتوب ديل/ }));
    expect(onSelect).toHaveBeenCalledWith('لابتوب ديل');
  });
});
