/**
 * __tests__/components/StorePaymentActions.test.tsx
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StorePaymentActions } from '@/components/payment/StorePaymentActions';

vi.mock('@/components/payment/StorePaymentMethods', () => ({
  StorePaymentMethods: (props: { storeName: string }) => (
    <div data-testid="store-payment-methods">{props.storeName}</div>
  ),
}));

describe('StorePaymentActions', () => {
  it('forwards store name to StorePaymentMethods', () => {
    render(
      <StorePaymentActions
        storeName="متجر الأمل"
        paymentMethods={[]}
        storePhone="0599"
      />,
    );
    expect(screen.getByTestId('store-payment-methods')).toHaveTextContent('متجر الأمل');
  });
});
