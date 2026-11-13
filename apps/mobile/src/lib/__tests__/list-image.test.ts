import { describe, expect, it } from 'vitest';
import { limitImagesForList, pickAnyImageUri, pickRemoteImageUri } from '../list-image';

describe('list image policy', () => {
  it('picks the first remote http(s) image and ignores junk', () => {
    expect(pickRemoteImageUri([null, 7, 'file:///a.jpg', 'https://x/1.jpg', 'http://x/2.jpg'])).toBe('https://x/1.jpg');
    expect(pickRemoteImageUri([])).toBeUndefined();
    expect(pickRemoteImageUri(undefined)).toBeUndefined();
  });

  it('accepts local offline images only through pickAnyImageUri', () => {
    expect(pickRemoteImageUri(['file:///a.jpg'])).toBeUndefined();
    expect(pickAnyImageUri(['file:///a.jpg', 'https://x/1.jpg'])).toBe('file:///a.jpg');
    expect(pickAnyImageUri(['content://media/1'])).toBe('content://media/1');
  });

  it('limits stored images for list snapshots', () => {
    expect(limitImagesForList(['a', 'b', 'c'])).toEqual(['a', 'b']);
    expect(limitImagesForList(['a', 'b', 'c'], 1)).toEqual(['a']);
    expect(limitImagesForList(null)).toBeUndefined();
  });
});
