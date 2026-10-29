import { describe, it, expect, beforeEach, vi } from 'vitest';

const mock = vi.hoisted(async () => {
  const { createSqliteMock } = await import('./helpers/sqlite-mock');
  return createSqliteMock();
});

vi.mock('expo-sqlite', async () => await mock);
vi.mock('@/storage/encrypted-database', async () => ({
  openEncryptedDatabaseAsync: async () => (await mock).openDatabaseAsync('marketplat-private-v2.db'),
}));

import {
  saveAdDraft, loadAdDraft, clearAdDraft,
  isAdImageReferencedByDraft,
  saveAdEditDraft, loadAdEditDraft, clearAdEditDraft,
  getAdDraftStorageSummary,
} from '@/storage/ad-draft-store';

const OWNER = 'user-1';

const VALID_DRAFT = {
  title: 'Test ad',
  description: 'A valid description',
  price: '100',
  city: 'Gaza',
  categoryId: 'cat-1',
  isNegotiable: false,
  images: [{ uri: 'file:///a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg' }],
};

describe('ad-draft-store', () => {
  beforeEach(async () => { (await mock)._clearAll(); });

  // ── saveAdDraft ─────────────────────────────────────────────────
  describe('saveAdDraft', () => {
    it('saves valid draft and returns empty removed-URIs', async () => {
      const removed = await saveAdDraft(OWNER, VALID_DRAFT);
      expect(removed).toEqual([]);
    });

    it('rejects empty ownerId', async () => {
      await expect(saveAdDraft('', VALID_DRAFT)).rejects.toThrow(/draft owner/);
    });

    it('rejects ownerId > 160 chars', async () => {
      await expect(saveAdDraft('a'.repeat(161), VALID_DRAFT)).rejects.toThrow(/draft owner/);
    });

    it('rejects invalid draft (missing title)', async () => {
      const bad = { ...VALID_DRAFT, title: undefined } as unknown as typeof VALID_DRAFT;
      await expect(saveAdDraft(OWNER, bad)).rejects.toThrow(/Invalid ad draft/);
    });

    it('rejects draft with > 10 images', async () => {
      const images = Array.from({ length: 11 }, (_, i) => ({
        uri: `file:///img${i}.jpg`, fileName: `img${i}.jpg`, mimeType: 'image/jpeg',
      }));
      await expect(saveAdDraft(OWNER, { ...VALID_DRAFT, images }))
        .rejects.toThrow(/Invalid ad draft/);
    });

    it('rejects draft > 100KB', async () => {
      const huge = { ...VALID_DRAFT, description: 'x'.repeat(100_001) };
      await expect(saveAdDraft(OWNER, huge)).rejects.toThrow(/exceeds the allowed local size/);
    });

    it('returns previously-referenced URIs on update', async () => {
      const draft1 = { ...VALID_DRAFT, images: [
        { uri: 'file:///a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg' },
        { uri: 'file:///b.jpg', fileName: 'b.jpg', mimeType: 'image/jpeg' },
      ]};
      await saveAdDraft(OWNER, draft1);
      const draft2 = { ...VALID_DRAFT, images: [
        { uri: 'file:///a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg' },
        { uri: 'file:///c.jpg', fileName: 'c.jpg', mimeType: 'image/jpeg' },
      ]};
      const removed = await saveAdDraft(OWNER, draft2);
      expect(removed).toEqual(['file:///b.jpg']);
    });

    it('returns empty array when images unchanged', async () => {
      await saveAdDraft(OWNER, VALID_DRAFT);
      const removed = await saveAdDraft(OWNER, VALID_DRAFT);
      expect(removed).toEqual([]);
    });
  });

  // ── loadAdDraft ─────────────────────────────────────────────────
  describe('loadAdDraft', () => {
    it('returns null for missing owner', async () => {
      expect(await loadAdDraft(OWNER)).toBeNull();
    });

    it('returns draft after save', async () => {
      await saveAdDraft(OWNER, VALID_DRAFT);
      const loaded = await loadAdDraft(OWNER);
      expect(loaded).not.toBeNull();
      expect(loaded!.ownerId).toBe(OWNER);
      expect(loaded!.draft.title).toBe('Test ad');
      expect(loaded!.updatedAt).toBeGreaterThan(0);
    });

    it('returns null for empty ownerId', async () => {
      expect(await loadAdDraft('')).toBeNull();
    });
  });

  // ── clearAdDraft ────────────────────────────────────────────────
  describe('clearAdDraft', () => {
    it('returns true after clearing existing', async () => {
      await saveAdDraft(OWNER, VALID_DRAFT);
      expect(await clearAdDraft(OWNER)).toBe(true);
      expect(await loadAdDraft(OWNER)).toBeNull();
    });

    it('returns false for missing draft', async () => {
      expect(await clearAdDraft(OWNER)).toBe(false);
    });
  });

  // ── isAdImageReferencedByDraft ──────────────────────────────────
  describe('isAdImageReferencedByDraft', () => {
    it('returns false for empty URI', async () => {
      expect(await isAdImageReferencedByDraft('')).toBe(false);
    });

    it('returns true when URI is in a saved draft', async () => {
      await saveAdDraft(OWNER, VALID_DRAFT);
      expect(await isAdImageReferencedByDraft('file:///a.jpg')).toBe(true);
    });

    it('returns false for URI not in any draft', async () => {
      await saveAdDraft(OWNER, VALID_DRAFT);
      expect(await isAdImageReferencedByDraft('file:///other.jpg')).toBe(false);
    });
  });

  // ── ad-edit-drafts ──────────────────────────────────────────────
  describe('ad-edit-drafts', () => {
    it('saves and loads edit draft', async () => {
      await saveAdEditDraft(OWNER, 'ad-1', VALID_DRAFT);
      const loaded = await loadAdEditDraft(OWNER, 'ad-1');
      expect(loaded).not.toBeNull();
      expect(loaded!.draft.title).toBe('Test ad');
    });

    it('loadAdEditDraft returns null for missing', async () => {
      expect(await loadAdEditDraft(OWNER, 'missing')).toBeNull();
    });

    it('clearAdEditDraft returns true', async () => {
      await saveAdEditDraft(OWNER, 'ad-1', VALID_DRAFT);
      expect(await clearAdEditDraft(OWNER, 'ad-1')).toBe(true);
      expect(await loadAdEditDraft(OWNER, 'ad-1')).toBeNull();
    });

    it('edit draft URI counts as referenced', async () => {
      await saveAdEditDraft(OWNER, 'ad-1', VALID_DRAFT);
      expect(await isAdImageReferencedByDraft('file:///a.jpg')).toBe(true);
    });
  });

  // ── getAdDraftStorageSummary ────────────────────────────────────
  describe('getAdDraftStorageSummary', () => {
    it('returns zero counts for empty', async () => {
      const s = await getAdDraftStorageSummary(OWNER);
      expect(s.drafts).toBe(0);
      expect(s.editDrafts).toBe(0);
      expect(s.sizeBytes).toBe(0);
      expect(s.newestUpdatedAt).toBeNull();
    });

    it('counts drafts and edit drafts', async () => {
      await saveAdDraft(OWNER, VALID_DRAFT);
      await saveAdEditDraft(OWNER, 'ad-1', VALID_DRAFT);
      await saveAdEditDraft(OWNER, 'ad-2', VALID_DRAFT);
      const s = await getAdDraftStorageSummary(OWNER);
      expect(s.drafts).toBe(1);
      expect(s.editDrafts).toBe(2);
      expect(s.sizeBytes).toBeGreaterThan(0);
      expect(s.newestUpdatedAt).toBeGreaterThan(0);
    });

    it('rejects empty ownerId', async () => {
      await expect(getAdDraftStorageSummary('')).rejects.toThrow(/valid account/);
    });
  });
});
