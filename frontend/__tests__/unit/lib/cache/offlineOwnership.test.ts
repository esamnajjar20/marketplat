import { beforeEach, describe, expect, it } from 'vitest';
import { getOfflineJson, saveOfflineJson } from '@/lib/offlineJsonCache';
import { getOfflineList, saveOfflineList } from '@/lib/offlineListCache';
describe('offline cache ownership isolation', () => {
  beforeEach(() => localStorage.clear());
  it('never serves JSON to another user', () => { saveOfflineJson('profile', { id: 'user-a' }, 'user-a'); expect(getOfflineJson('profile','user-a')?.data).toEqual({id:'user-a'}); expect(getOfflineJson('profile','user-b')).toBeNull(); });
  it('never serves a list to another user', () => { saveOfflineList('my-ads',[{id:'ad-a'}],10,'user-a'); expect(getOfflineList('my-ads','user-a')?.items).toEqual([{id:'ad-a'}]); expect(getOfflineList('my-ads','user-b')).toBeNull(); });
  it('does not bypass an explicitly scoped read when identity is wrong', () => { saveOfflineJson('profile',{id:'user-a'},'user-a'); expect(getOfflineJson('profile','user-b')).toBeNull(); });
});
