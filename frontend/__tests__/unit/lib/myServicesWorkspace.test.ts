import { describe, expect, it } from 'vitest';
import {
  myServicesWorkspaceParamsFromSearchParams,
  normalizeMyServicesWorkspaceParams,
} from '@/lib/myServicesWorkspace';

describe('myServicesWorkspace query normalization', () => {
  it('normalizes page, status and search consistently from the URL', () => {
    const params = new URLSearchParams('page=3&status=PAUSED&q=%20مكيفات%20');
    expect(myServicesWorkspaceParamsFromSearchParams(params)).toEqual({
      page: 3,
      limit: 10,
      status: 'PAUSED',
      search: 'مكيفات',
    });
  });

  it('falls back to the first page and ignores invalid status values', () => {
    const params = new URLSearchParams('page=-2&status=UNKNOWN&q=%20%20');
    expect(myServicesWorkspaceParamsFromSearchParams(params)).toEqual({
      page: 1,
      limit: 10,
    });
  });

  it('produces the same canonical params for the hub and listing component inputs', () => {
    const fromUrl = myServicesWorkspaceParamsFromSearchParams(
      new URLSearchParams('page=2&status=ACTIVE&q=repair'),
    );
    const fromListState = normalizeMyServicesWorkspaceParams({
      page: 2,
      status: 'ACTIVE',
      search: ' repair ',
    });
    expect(fromUrl).toEqual(fromListState);
  });
});
