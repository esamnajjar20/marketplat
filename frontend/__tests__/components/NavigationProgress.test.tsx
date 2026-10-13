import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NavigationProgress } from '@/components/shared/NavigationProgress';

describe('NavigationProgress', () => {
  it('renders no navigation loading indicator', () => {
    const { container } = render(<NavigationProgress />);
    expect(container.firstChild).toBeNull();
  });
});
