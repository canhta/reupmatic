import {
  appendFileSync,
  closeSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import {
  DIAGNOSTIC_LEVELS,
  type DiagnosticEntry,
  type DiagnosticLevel,
  type DiagnosticRecord,
  validateDiagnosticRecord,
} from '../../core/diagnostics/diagnostic-record.js';
import type { DiagnosticRecorder } from '../../core/diagnostics/recorder.js';
import { redact } from '../../core/diagnostics/redact.js';

// Writes are synchronous, so "flush" means finalising the file, not draining a buffer.
export const DIAGNOSTIC_FILE = 'reupmatic-diagnostics.ndjson';
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const RETAINED_FILES = 5;

export interface SystemSummary {
  app: string;
  os: string;
  arch: string;
  runtime: Record<string, string>;
}

export interface DiagnosticSink extends DiagnosticRecorder {
  readonly directory: string;
  exportBundle(destination: string, summary: SystemSummary): { path: string; records: number };
  /** Finalises the file; later records are dropped, not buffered. */
  close(): void;
}

export interface DiagnosticSinkConfig {
  directory: string;
  level?: DiagnosticLevel;
  now?: () => Date;
  maxFileBytes?: number;
  retainedFiles?: number;
}

export function levelFromEnvironment(value: string | undefined): DiagnosticLevel {
  return DIAGNOSTIC_LEVELS.includes(value as DiagnosticLevel) ? (value as DiagnosticLevel) : 'info';
}

function rotatedName(index: number): string {
  return `${DIAGNOSTIC_FILE}.${index}`;
}

/** Newest first: the live file, then `.1`, `.2`, … */
export function retainedFiles(directory: string): string[] {
  let names: string[];
  try {
    names = readdirSync(directory);
  } catch {
    return [];
  }
  const rotated = names
    .filter((name) => name.startsWith(`${DIAGNOSTIC_FILE}.`))
    .map((name) => ({ name, index: Number(name.slice(DIAGNOSTIC_FILE.length + 1)) }))
    .filter((entry) => Number.isInteger(entry.index) && entry.index > 0)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.name);
  const live = names.includes(DIAGNOSTIC_FILE) ? [DIAGNOSTIC_FILE] : [];
  return [...live, ...rotated].map((name) => path.join(directory, name));
}

export function createDiagnosticSink(config: DiagnosticSinkConfig): DiagnosticSink {
  const {
    directory,
    level = 'info',
    now = () => new Date(),
    maxFileBytes = MAX_FILE_BYTES,
    retainedFiles: retain = RETAINED_FILES,
  } = config;
  const file = path.join(directory, DIAGNOSTIC_FILE);
  const threshold = DIAGNOSTIC_LEVELS.indexOf(level);
  let closed = false;
  let bytes = 0;
  let ready = false;

  function open(): void {
    if (ready) return;
    try {
      mkdirSync(directory, { recursive: true });
      bytes = statSync(file).size;
    } catch {
      bytes = 0;
    }
    ready = true;
  }

  function rotate(): void {
    rmSync(path.join(directory, rotatedName(retain - 1)), { force: true });
    for (let index = retain - 2; index >= 1; index -= 1) {
      try {
        renameSync(
          path.join(directory, rotatedName(index)),
          path.join(directory, rotatedName(index + 1)),
        );
      } catch {
        // A missing rung is normal before the window has filled.
      }
    }
    try {
      renameSync(file, path.join(directory, rotatedName(1)));
    } catch {
      // Nothing to rotate yet.
    }
    bytes = 0;
  }

  function write(record: DiagnosticRecord): void {
    const line = `${JSON.stringify(redact(record))}\n`;
    const size = Buffer.byteLength(line, 'utf8');
    if (bytes && bytes + size > maxFileBytes) rotate();
    try {
      appendFileSync(file, line);
      bytes += size;
    } catch {
      // A disk that cannot be written must not take the application down with it.
      ready = false;
    }
  }

  return {
    directory,
    record(entry: DiagnosticEntry): void {
      if (closed) return;
      if (DIAGNOSTIC_LEVELS.indexOf(entry.level) > threshold) return;
      let record: DiagnosticRecord;
      try {
        record = validateDiagnosticRecord({ ...entry, at: entry.at ?? now().toISOString() });
      } catch {
        return;
      }
      open();
      write(record);
    },
    exportBundle(destination, summary) {
      const files = retainedFiles(directory);
      const lines: string[] = [
        JSON.stringify(
          redact(
            validateDiagnosticRecord({
              at: now().toISOString(),
              level: 'info',
              source: { process: 'main', module: 'diagnostics' },
              event: 'support.bundle',
              detail: { app: summary.app, os: summary.os, arch: summary.arch, ...summary.runtime },
            }),
          ),
        ),
      ];
      for (const name of [...files].reverse()) {
        let contents: string;
        try {
          contents = readFileSync(name, 'utf8');
        } catch {
          continue;
        }
        // Re-validate on read so a hand-edited file can't smuggle unvalidated data.
        for (const line of contents.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            lines.push(JSON.stringify(redact(validateDiagnosticRecord(JSON.parse(trimmed)))));
          } catch {
            // A corrupted line is dropped rather than shared.
          }
        }
      }
      const target = destination.endsWith('.ndjson') ? destination : `${destination}.ndjson`;
      const handle = openSync(target, 'w');
      try {
        writeFileSync(handle, `${lines.join('\n')}\n`);
      } finally {
        closeSync(handle);
      }
      return { path: target, records: lines.length };
    },
    close() {
      if (closed) return;
      this.record({
        level: 'info',
        source: { process: 'main', module: 'diagnostics' },
        event: 'app.diagnostics-closed',
      });
      closed = true;
    },
  };
}
