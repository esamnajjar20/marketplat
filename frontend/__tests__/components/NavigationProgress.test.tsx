import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { NavigationProgress, signalNavigationStart } from '@/components/shared/NavigationProgress';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: { value: '/' } }));
vi.mock('next/navigation', () => ({ usePathname: () => mockPathname.value }));

afterEach(() => {
  mockPathname.value = '/';
  cleanup();
  vi.useRealTimers();
});

describe('NavigationProgress', () => {
  it('does not flash a progress bar before navigation starts', () => {
    const { container } = render(<NavigationProgress />);
    expect(container.firstChild).toBeNull();
  });

  it('does not start a page-navigation bar for query-only or hash-only changes', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);
    for (const href of ['/?q=chairs', '/#featured']) {
      const anchor = document.createElement('a');
      anchor.href = href;
      document.body.appendChild(anchor);
      anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
      await vi.advanceTimersByTimeAsync(150);
      expect(container.querySelector('[role="progressbar"]')).toBeNull();
      anchor.remove();
    }
  });

  it('clears the progress bar when the pathname changes after it becomes visible', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container, rerender } = render(<NavigationProgress />);

    signalNavigationStart('/products/new');
    await vi.advanceTimersByTimeAsync(121);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();

    window.history.replaceState({}, '', '/products/new');
    mockPathname.value = '/products/new';
    rerender(<NavigationProgress />);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('cancels the delayed show when the pathname changes before the bar appears', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container, rerender } = render(<NavigationProgress />);

    signalNavigationStart('/products/new');
    await vi.advanceTimersByTimeAsync(60);
    window.history.replaceState({}, '', '/products/new');
    mockPathname.value = '/products/new';
    rerender(<NavigationProgress />);
    await vi.advanceTimersByTimeAsync(200);

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('starts for programmatic navigation to another path', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);
    signalNavigationStart('/products/new');
    await vi.advanceTimersByTimeAsync(121);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
  });


  it('does not reset the failsafe when the same destination is clicked repeatedly', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);
    const anchor = document.createElement('a');
    anchor.href = '/products';
    document.body.appendChild(anchor);

    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(121);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(11_000);
    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(900);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    anchor.remove();
  });

  it('restarts the failsafe for a different destination without inheriting the old timeout', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);

    signalNavigationStart('/products/first');
    await vi.advanceTimersByTimeAsync(121);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(11_500);
    signalNavigationStart('/products/second');
    await vi.advanceTimersByTimeAsync(600);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();

    await vi.advanceTimersByTimeAsync(11_500);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('cleans up navigation timers when the component unmounts', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { unmount } = render(<NavigationProgress />);
    signalNavigationStart('/products/new');
    unmount();

    await vi.advanceTimersByTimeAsync(12_500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('starts for intercepted internal links when the client router prevents native navigation', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);
    const anchor = document.createElement('a');
    anchor.href = '/products';
    anchor.addEventListener('click', (event) => event.preventDefault());
    document.body.appendChild(anchor);

    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(150);
    expect(container.querySelector('[role="progressbar"]')).not.toBeNull();
    anchor.remove();
  });

  it('ignores clicks on disabled links and links that open another browsing context', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);
    const disabled = document.createElement('a');
    disabled.href = '/products';
    disabled.setAttribute('aria-disabled', 'true');
    const externalContext = document.createElement('a');
    externalContext.href = '/products';
    externalContext.target = '_blank';
    document.body.append(disabled, externalContext);

    disabled.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    externalContext.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(150);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    disabled.remove();
    externalContext.remove();
  });


  it('does not start navigation feedback for external, downloadable, or modified-click links', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);

    const external = document.createElement('a');
    external.href = 'https://example.com/products';
    const download = document.createElement('a');
    download.href = '/products/export';
    download.setAttribute('download', 'export.csv');
    const internal = document.createElement('a');
    internal.href = '/products';
    document.body.append(external, download, internal);

    external.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    download.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    internal.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true }));
    internal.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 1 }));
    await vi.advanceTimersByTimeAsync(150);

    expect(container.querySelector('[role="progressbar"]')).toBeNull();
    external.remove();
    download.remove();
    internal.remove();
  });

  it('does not start navigation feedback for a programmatic external URL', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);

    signalNavigationStart('https://example.com/products');
    await vi.advanceTimersByTimeAsync(150);
    expect(container.querySelector('[role="progressbar"]')).toBeNull();
  });

  it('shows an accessible progress bar after an internal link click takes long enough', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    const { container } = render(<NavigationProgress />);
    const anchor = document.createElement('a');
    anchor.href = '/products';
    anchor.textContent = 'Products';
    document.body.appendChild(anchor);

    anchor.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    await vi.advanceTimersByTimeAsync(121);
    expect(container.querySelector('[role="progressbar"]')?.getAttribute('aria-label'))
      .toBe('جارٍ الانتقال بين الصفحات');
    anchor.remove();
  });
});
