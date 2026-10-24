import { describe, expect, it } from 'vitest';
import { renderToString } from 'react-dom/server';
import { render } from '@testing-library/react';
import { useMounted } from '@/hooks/useMounted';

function Probe() {
  return <span data-testid="probe">{useMounted() ? 'client' : 'server'}</span>;
}

describe('useMounted', () => {
  // REGRESSION (FIX HYDRATION-418-HOME-01): the server snapshot must be `false`
  // so the first hydration render matches the SSR markup.
  it('is false while server-rendering', () => {
    expect(renderToString(<Probe />)).toContain('server');
  });

  it('is true on a normal client render', () => {
    const { getByTestId } = render(<Probe />);
    expect(getByTestId('probe').textContent).toBe('client');
  });
});
