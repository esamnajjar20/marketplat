import { buildPaginationMeta, getPaginationParams } from '../../src/shared/utils/pagination';

describe('Pagination Utils', () => {
  it('should return defaults', () => {
    const r = getPaginationParams({});
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
    expect(r.skip).toBe(0);
  });

  it('should calculate skip correctly', () => {
    const r = getPaginationParams({ page: 3, limit: 10 });
    expect(r.skip).toBe(20);
  });

  it('should enforce max limit of 100', () => {
    expect(getPaginationParams({ limit: 999 }).limit).toBe(100);
  });

  it('should enforce minimum page of 1', () => {
    expect(getPaginationParams({ page: -5 }).page).toBe(1);
  });

  it('should accept numeric page and limit arguments', () => {
    const r = getPaginationParams(2, 10);
    expect(r.page).toBe(2);
    expect(r.limit).toBe(10);
    expect(r.skip).toBe(10);
  });

  it('should enforce minimum limit of 1', () => {
    expect(getPaginationParams({ limit: 0 }).limit).toBe(1);
  });

  it('should calculate totalPages correctly', () => {
    expect(buildPaginationMeta(100, 1, 20).totalPages).toBe(5);
  });

  it('should round up totalPages', () => {
    expect(buildPaginationMeta(21, 1, 20).totalPages).toBe(2);
  });

  it('should handle zero total', () => {
    expect(buildPaginationMeta(0, 1, 20).totalPages).toBe(0);
  });
});
