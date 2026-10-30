import { openEncryptedDatabaseAsync } from '@/storage/encrypted-database';
import * as Crypto from 'expo-crypto';

export type SavedPayee = { id: string; ownerId: string; name: string; number: string; method: 'jawwal' | 'palpay' | 'bank'; createdAt: string };
export type SavedNetCard = { id: string; ownerId: string; label: string; username: string; createdAt: string };

async function ensureSchema() {
  const db = await openEncryptedDatabaseAsync();
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS mobile_saved_payees (
      id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, number TEXT NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('jawwal','palpay','bank')),
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mobile_saved_net_cards (
      id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, label TEXT NOT NULL, username TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mobile_saved_payees_owner_created ON mobile_saved_payees(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_mobile_saved_net_cards_owner_created ON mobile_saved_net_cards(owner_id, created_at DESC);
  `);
  return db;
}


function createId(): string {
  return Crypto.randomUUID();
}

export async function listSavedPayees(ownerId: string): Promise<SavedPayee[]> {
  const db = await ensureSchema();
  return db.getAllAsync<SavedPayee>('SELECT id, owner_id AS ownerId, name, number, method, created_at AS createdAt FROM mobile_saved_payees WHERE owner_id = ? ORDER BY created_at DESC LIMIT 60', ownerId);
}
export async function listSavedNetCards(ownerId: string): Promise<SavedNetCard[]> {
  const db = await ensureSchema();
  return db.getAllAsync<SavedNetCard>('SELECT id, owner_id AS ownerId, label, username, created_at AS createdAt FROM mobile_saved_net_cards WHERE owner_id = ? ORDER BY created_at DESC LIMIT 60', ownerId);
}
export async function savePayee(input: Omit<SavedPayee, 'id' | 'createdAt' | 'ownerId'>, ownerId: string): Promise<void> {
  const db = await ensureSchema();
  await db.runAsync(`INSERT INTO mobile_saved_payees (id,owner_id,name,number,method,created_at) VALUES (?,?,?,?,?,?)`, createId(), ownerId, input.name.trim(), input.number.trim(), input.method, new Date().toISOString());
}
export async function saveNetCard(input: Omit<SavedNetCard, 'id' | 'createdAt' | 'ownerId'>, ownerId: string): Promise<void> {
  const db = await ensureSchema();
  await db.runAsync(`INSERT INTO mobile_saved_net_cards (id,owner_id,label,username,created_at) VALUES (?,?,?,?,?)`, createId(), ownerId, input.label.trim(), input.username.trim(), new Date().toISOString());
}
export async function deleteSavedPayee(id: string, ownerId: string): Promise<void> {
  const db = await ensureSchema();
  await db.runAsync('DELETE FROM mobile_saved_payees WHERE id = ? AND owner_id = ?', id, ownerId);
}
export async function deleteSavedNetCard(id: string, ownerId: string): Promise<void> {
  const db = await ensureSchema();
  await db.runAsync('DELETE FROM mobile_saved_net_cards WHERE id = ? AND owner_id = ?', id, ownerId);
}

export async function updateSavedPayee(id: string, ownerId: string, input: Omit<SavedPayee, 'id' | 'ownerId' | 'createdAt'>): Promise<void> {
  const db = await ensureSchema();
  await db.runAsync('UPDATE mobile_saved_payees SET name = ?, number = ?, method = ? WHERE id = ? AND owner_id = ?', input.name.trim(), input.number.trim(), input.method, id, ownerId);
}
export async function updateSavedNetCard(id: string, ownerId: string, input: Omit<SavedNetCard, 'id' | 'ownerId' | 'createdAt'>): Promise<void> {
  const db = await ensureSchema();
  await db.runAsync('UPDATE mobile_saved_net_cards SET label = ?, username = ? WHERE id = ? AND owner_id = ?', input.label.trim(), input.username.trim(), id, ownerId);
}
