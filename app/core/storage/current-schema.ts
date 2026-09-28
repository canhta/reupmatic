import { DatabaseSync } from 'node:sqlite';

interface CurrentSchema {
  tables: readonly string[];
  sql: string;
}

export function openCurrentDatabase(
  filename: string,
  schema: CurrentSchema,
  schemaError: Error,
): DatabaseSync {
  const database = new DatabaseSync(filename);
  const expected = [...schema.tables].sort();
  function needsInitialization(): boolean {
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_schema WHERE type='table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
      )
      .all()
      .map((row) => String(row.name));
    if (tables.length === 0) return true;
    if (tables.length !== expected.length || tables.some((name, index) => name !== expected[index]))
      throw schemaError;
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
