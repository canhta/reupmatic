import { DatabaseSync } from 'node:sqlite';

interface CurrentSchema {
  version: number;
  tables: readonly string[];
  sql: string;
}

export function openCurrentDatabase(
  filename: string,
  schema: CurrentSchema,
  versionError: Error,
): DatabaseSync {
  if (!Number.isSafeInteger(schema.version) || schema.version < 1 || schema.version > 2147483647) {
    throw new Error('INVALID_SCHEMA_DEFINITION');
  }
  const database = new DatabaseSync(filename);
  const expected = [...schema.tables].sort();
  function needsInitialization(): boolean {
    const version = Number(database.prepare('PRAGMA user_version').get()?.user_version);
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    if (version === 0 && tables.length === 0) return true;
    if (
      version !== schema.version ||
      tables.length !== expected.length ||
      tables.some((name, index) => name !== expected[index])
    )
      throw versionError;
    return false;
  }
  try {
    const initialize = needsInitialization();
    database.exec(
      'PRAGMA busy_timeout=1500; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;',
    );
    if (initialize) {
      database.exec('BEGIN IMMEDIATE');
      try {
        if (needsInitialization()) {
          database.exec(schema.sql);
          database.exec(`PRAGMA user_version=${schema.version}`);
          needsInitialization();
        }
        database.exec('COMMIT');
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
