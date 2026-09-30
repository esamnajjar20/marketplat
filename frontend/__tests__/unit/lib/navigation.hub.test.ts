import { describe, it, expect } from 'vitest';
import { navChildIsActive, STORE_GROUP } from '@/lib/navigation';

const child = (label: string) => {
  const c = STORE_GROUP.children.find((x) => x.label === label);
  if (!c) throw new Error(`missing child ${label}`);
  return c;
};

describe('navChildIsActive — /my-store hub tabs (MY-STORE-HUB-01)', () => {
  it('overview is active only when no other tab is selected', () => {
    expect(navChildIsActive('/my-store', child('لوحة المتجر'), '')).toBe(true);
    expect(navChildIsActive('/my-store', child('لوحة المتجر'), '?tab=overview')).toBe(true);
    expect(navChildIsActive('/my-store', child('لوحة المتجر'), '?tab=products')).toBe(false);
  });

  it('a tab child is active only for its own ?tab=', () => {
    expect(navChildIsActive('/my-store', child('منتجاتي'), '?tab=products')).toBe(true);
    expect(navChildIsActive('/my-store', child('منتجاتي'), '?tab=products&page=2')).toBe(true);
    expect(navChildIsActive('/my-store', child('منتجاتي'), '?tab=inventory')).toBe(false);
    expect(navChildIsActive('/my-store', child('منتجاتي'), '')).toBe(false);
  });

  it('hub tabs are inactive away from /my-store', () => {
    expect(navChildIsActive('/my-services', child('منتجاتي'), '?tab=products')).toBe(false);
  });

  it('non-hub children keep their pathname behaviour', () => {
    expect(navChildIsActive('/my-store/followed', child('المتاجر المتابَعة'), '')).toBe(true);
  });
});
