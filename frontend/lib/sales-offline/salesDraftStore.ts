'use client';

import type { CreateSalePayload } from '@/types/sale.types';

const DB_NAME = 'market-sales-offline';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

export type SalesDraftStatus = 'pending' | 'conflict' | 'failed';

export interface SalesOfflineDraft {
  id: string;
  operationId: string;
  userId: string;
  payload: CreateSalePayload;
  status: SalesDraftStatus;
  createdAt: number;
  updatedAt: number;
  lastError?: { status?: number; message?: string };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB غير متاح'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('userId', 'userId', { unique: false });
        store.createIndex('operationId', 'operationId', { unique: true });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => void): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    fn(tx.objectStore(STORE_NAME));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
  db.close();
}

async function readAll(): Promise<SalesOfflineDraft[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => { db.close(); resolve((request.result ?? []) as SalesOfflineDraft[]); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function saveSalesDraft(draft: SalesOfflineDraft): Promise<void> {
  await transaction('readwrite', store => store.put(draft));
}

export async function createSalesDraft(userId: string, operationId: string, payload: CreateSalePayload): Promise<SalesOfflineDraft> {
  const now = Date.now();
  const draft: SalesOfflineDraft = { id: operationId, operationId, userId, payload, status: 'pending', createdAt: now, updatedAt: now };
  await saveSalesDraft(draft);
  return draft;
}

export async function getSalesDraft(operationId: string): Promise<SalesOfflineDraft | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(operationId);
    request.onsuccess = () => { db.close(); resolve((request.result as SalesOfflineDraft | undefined) ?? null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

export async function listSalesDrafts(userId: string | null): Promise<SalesOfflineDraft[]> {
  const rows = await readAll();
  return rows.filter(row => !userId || row.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function updateSalesDraft(operationId: string, patch: Partial<SalesOfflineDraft>): Promise<void> {
  const current = await getSalesDraft(operationId);
  if (!current) return;
  await saveSalesDraft({ ...current, ...patch, updatedAt: Date.now() });
}

export async function deleteSalesDraft(operationId: string): Promise<void> {
  await transaction('readwrite', store => store.delete(operationId));
}

/** Clear every local sales draft on an explicit session boundary. */
export async function clearAllSalesDrafts(): Promise<void> {
  await transaction('readwrite', store => store.clear());
}
