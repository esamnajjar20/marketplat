import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineActionGate } from '@/components/shared/OfflineActionGate';

let online = false;
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => online }));

describe('OfflineActionGate', () => {
  beforeEach(() => {
    online = false;
  });

  it('makes gated actions inert and announces why while offline', () => {
    render(
      <OfflineActionGate>
        <button type="button">إرسال</button>
      </OfflineActionGate>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('هذا الإجراء يحتاج اتصالاً بالإنترنت');
    expect(screen.getByRole('button', { name: 'إرسال' }).closest('[inert]')).not.toBeNull();
  });

  it('restores interaction and hides the offline notice when online', () => {
    online = true;
    render(
      <OfflineActionGate>
        <button type="button">إرسال</button>
      </OfflineActionGate>,
    );

    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إرسال' }).closest('[inert]')).toBeNull();
  });
});
