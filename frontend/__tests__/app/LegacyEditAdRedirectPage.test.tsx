/**
 * __tests__/app/LegacyEditAdRedirectPage.test.tsx
 *
 * AUDIT-FIX (protected — file organization): /ads/[id]/edit used to be
 * a full duplicate implementation of "edit my ad" (see
 * EditAdPage.test.tsx's comment). It's now a redirect to the canonical
 * /my-ads/[id] route via ROUTES.adEdit(id) — this covers that it
 * forwards with the right id and does not render anything itself.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { Suspense } from 'react';
import LegacyEditAdRedirectPage from '@/app/(protected)/ads/[id]/edit/page';
import { ROUTES } from '@/lib/constants';

const mockReplace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

async function renderPage(id = 'ad-1') {
  await act(async () => {
    render(
      <Suspense fallback={null}>
        <LegacyEditAdRedirectPage params={Promise.resolve({ id })} />
      </Suspense>,
    );
    await Promise.resolve();
  });
}

describe('LegacyEditAdRedirectPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('redirects to the canonical /my-ads/[id] route for the given id', async () => {
    await renderPage('ad-42');

    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(ROUTES.adEdit('ad-42')));
  });

  it('renders nothing itself', async () => {
    const { container } = render(
      <Suspense fallback={null}>
        <LegacyEditAdRedirectPage params={Promise.resolve({ id: 'ad-1' })} />
      </Suspense>,
    );
    await act(async () => { await Promise.resolve(); });

    expect(container).toBeEmptyDOMElement();
  });
});
