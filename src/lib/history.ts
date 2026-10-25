import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

/**
 * Scan history lives in its own writable database. The bundled quran DB is
 * replaced whenever its version is bumped, which would wipe anything stored there.
 */
const USER_DB_NAME = 'user.db';
const USER_DB_VERSION = 1;

export type ScanRecord = { id: number; from_id: number; to_id: number; scanned_at: number };

let userDb: Promise<SQLiteDatabase> | null = null;

function getUserDb(): Promise<SQLiteDatabase> {
  userDb ??= openDatabaseAsync(USER_DB_NAME).then(async (db) => {
    await migrate(db);
    return db;
  });
  return userDb;
}

async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const version = row?.user_version ?? 0;
  if (version >= USER_DB_VERSION) return;
  if (version < 1) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE scan_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        from_id INTEGER NOT NULL,
        to_id INTEGER NOT NULL,
        scanned_at INTEGER NOT NULL
      );
      CREATE UNIQUE INDEX scan_history_range ON scan_history (from_id, to_id);
      CREATE INDEX scan_history_scanned_at ON scan_history (scanned_at DESC);
    `);
  }
  await db.execAsync(`PRAGMA user_version = ${USER_DB_VERSION}`);
}

/** Records a scan; scanning the same verses again moves it back to the top instead of duplicating it. */
export async function recordScan(fromId: number, toId: number): Promise<void> {
  const db = await getUserDb();
  await db.runAsync(
    `INSERT INTO scan_history (from_id, to_id, scanned_at) VALUES (?, ?, ?)
     ON CONFLICT (from_id, to_id) DO UPDATE SET scanned_at = excluded.scanned_at`,
    fromId,
    toId,
    Date.now()
  );
}

export async function listScans(): Promise<ScanRecord[]> {
  const db = await getUserDb();
  return db.getAllAsync<ScanRecord>('SELECT * FROM scan_history ORDER BY scanned_at DESC');
}

export async function deleteScan(id: number): Promise<void> {
  const db = await getUserDb();
  await db.runAsync('DELETE FROM scan_history WHERE id = ?', id);
}

export async function clearScans(): Promise<void> {
  const db = await getUserDb();
  await db.runAsync('DELETE FROM scan_history');
}
