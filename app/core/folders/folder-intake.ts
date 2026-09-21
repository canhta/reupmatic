import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { BatchQueue } from '../batch/batch-queue.js';
import { hashFile } from '../media/files.js';
import { RemoteError } from '../worker/remote-error.js';
import type { FolderConfig, FolderSnapshot } from './folder-contracts.js';
import { type FolderEntry, type FolderRule, FolderStore } from './folder-store.js';

const EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi']);
const MAX_ENTRIES = 10000; // Fail visibly, not a silent partial initial inventory.
export function within(root: string, filename: string): boolean {
  const relative = path.relative(root, filename);
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  );
}
export function admissionId(ruleId: string, sha256: string): string {
  return `watch_${createHash('sha256').update(`${ruleId}\0${sha256}`).digest('hex')}`;
}
export async function validateRoots(config: FolderConfig, workspace: string): Promise<void> {
  for (const root of [config.source_dir, config.output_dir]) {
    if (
      !path.isAbsolute(root) ||
      (await fs.realpath(root).catch(() => '')) !== root ||
      !(await fs.stat(root)).isDirectory()
    )
      throw new RemoteError('WATCH_FOLDER_MISSING');
  }
  // A child output is supported and pruned; source inside output is not.
  if (
    within(config.output_dir, config.source_dir) ||
    within(workspace, config.source_dir) ||
    within(config.source_dir, workspace) ||
    within(workspace, config.output_dir)
  )
    throw new RemoteError('WATCH_OUTPUT_LOOP');
}
async function fileEntry(filename: string): Promise<FolderEntry | null> {
  const stat = await fs.lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0) return null;
  if ((await fs.realpath(filename)) !== filename) return null;
  return {
    path: filename,
    fingerprint: `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`,
  };
}
/** Directory snapshot uses native filesystem APIs only for reconciliation. OS
 * observation remains the Chokidar adapter, not a replacement watcher engine.
 */
export async function collectFiles(
  rule: FolderConfig,
  excludedDirs: string[],
  excludedFiles: Set<string>,
): Promise<FolderEntry[]> {
  const result: FolderEntry[] = [];
  let visited = 0;
  const walk = async (directory: string, depth: number): Promise<void> => {
    if (depth > 32) throw new RemoteError('WATCH_SCAN_LIMIT');
    // Reject link/junction changes between recursive directory observations.
    if ((await fs.realpath(directory)) !== directory) throw new RemoteError('WATCH_FOLDER_CHANGED');
    const stream = await fs.opendir(directory);
    for await (const entry of stream) {
      if (++visited > MAX_ENTRIES) throw new RemoteError('WATCH_SCAN_LIMIT');
      const filename = path.join(directory, entry.name);
      if (
        entry.name.startsWith('.') ||
        entry.isSymbolicLink() ||
        excludedDirs.some((root) => within(root, filename)) ||
        excludedFiles.has(filename)
      )
        continue;
      if (entry.isDirectory()) {
        if (rule.recursive) await walk(filename, depth + 1);
        continue;
      }
      if (!EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      try {
        const value = await fileEntry(filename);
        if (value) result.push(value);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  };
  await walk(rule.source_dir, 0);
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
export interface WatchHandle {
  close(): Promise<void>;
}
export type AttachWatcher = (
  rule: FolderRule,
  changed: () => void,
  failed: (error: unknown) => void,
) => Promise<WatchHandle>;
interface Runtime {
  handle?: WatchHandle;
  inFlight?: Promise<void>;
  timer?: ReturnType<typeof setTimeout>;
  interval?: ReturnType<typeof setInterval>;
  observed: Map<string, { fingerprint: string; since: number }>;
  checked: Map<string, string>;
  scanning: boolean;
  lastScan: number | null;
  error: string | null;
  errorFile: string | null;
}
export interface FolderIntakeOptions {
  databasePath: string;
  workspace: string;
  attach: AttachWatcher;
  authorize(): boolean;
  protectSource?(filename: string): void;
  stableMs?: number;
  reconcileMs?: number;
  now?: () => number;
}
function safeCode(error: unknown): string {
  const value = (error as NodeJS.ErrnoException)?.code;
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,80}$/.test(value) ? value : 'WATCH_FAILED';
}

/** No job execution/AI here: admission into the existing BatchQueue only.
 * Saved rules reopen paused. Production Plus authorization is not implemented
 * by this integration helper; the host supplies a fail-closed access gate.
 */
export class FolderIntake extends EventEmitter {
  private readonly store: FolderStore;
  private readonly queue: Pick<BatchQueue, 'admitFolder' | 'outputPaths' | 'snapshot'>;
  private readonly options: FolderIntakeOptions;
  private readonly active = new Map<string, Runtime>();
  private readonly starting = new Set<string>();
  private readonly pendingStarts = new Set<Promise<FolderSnapshot>>();
  private version = 0;
  private closing = false;
  private readonly stableMs: number;
  private readonly now: () => number;
  constructor(
    queue: Pick<BatchQueue, 'admitFolder' | 'outputPaths' | 'snapshot'>,
    options: FolderIntakeOptions,
  ) {
    super();
    this.store = new FolderStore(options.databasePath);
    this.queue = queue;
    this.options = options;
    this.stableMs = options.stableMs ?? 2000;
    this.now = options.now ?? Date.now;
  }
  get activeCount(): number {
    return this.active.size + this.starting.size;
  }
  snapshot(): FolderSnapshot {
    return {
      version: this.version,
      available: this.options.authorize() && !this.closing,
      developer_only: true,
      queue_paused: this.queue.snapshot().paused,
      rules: this.store.list().map((rule) => {
        const runtime = this.active.get(rule.id);
        return {
          id: rule.id,
          source_name: rule.source_dir,
          ...(rule.processing ? { processing: rule.processing } : {}),
          output_name: rule.output_dir,
          include_existing: rule.include_existing,
          recursive: rule.recursive,
          initialized: rule.initialized,
          state: runtime
            ? runtime.error
              ? 'needs_attention'
              : !runtime.handle || runtime.scanning
                ? 'scanning'
                : 'watching'
            : 'paused',
          admitted: this.store.count(rule.id),
          last_scan: runtime?.lastScan ?? null,
          error_code: runtime?.error ?? null,
          error_file: runtime?.errorFile ?? null,
        };
      }),
    };
  }
  private changed(): void {
    this.version++;
    this.emit('changed', this.snapshot());
  }
  notifyQueue(): void {
    if (!this.closing) this.changed();
  }
  private allowed(): void {
    if (this.closing) throw new RemoteError('WATCH_CLOSED');
    if (!this.options.authorize()) throw new RemoteError('AUTOMATION_UNAVAILABLE');
  }
  async create(config: FolderConfig): Promise<FolderSnapshot> {
    this.allowed();
    await validateRoots(config, this.options.workspace);
    this.allowed();
    if (
      this.store
        .list()
        .some(
          (rule) =>
            within(rule.output_dir, config.source_dir) ||
            within(config.output_dir, rule.source_dir),
        )
    ) {
      throw new RemoteError('WATCH_OUTPUT_LOOP');
    }
    this.store.add(config);
    this.changed();
    return this.snapshot();
  }
  start(id: string): Promise<FolderSnapshot> {
    const task = this.startRule(id);
    this.pendingStarts.add(task);
    void task.finally(() => this.pendingStarts.delete(task)).catch(() => undefined);
    return task;
  }
  private async startRule(id: string): Promise<FolderSnapshot> {
    this.allowed();
    if (this.active.has(id) || this.starting.has(id)) return this.snapshot();
    this.starting.add(id);
    try {
      const rule = this.store.get(id);
      await validateRoots(rule, this.options.workspace);
      // No background history intake on creation. Baseline is established only
      // when the user starts the saved rule for the first time.
      if (!rule.initialized) {
        const baseline = await collectFiles(
          rule,
          this.exclusions(),
          new Set(this.queue.outputPaths()),
        );
        this.allowed();
        if (!this.starting.has(id)) return this.snapshot();
        this.store.initialize(id, rule.include_existing ? [] : baseline);
      }
      this.allowed();
      if (!this.starting.has(id)) return this.snapshot();
      const runtime: Runtime = {
        observed: new Map(),
        checked: new Map(),
        scanning: false,
        lastScan: null,
        error: null,
        errorFile: null,
      };
      this.active.set(id, runtime);
      try {
        const handle = await this.options.attach(
          rule,
          () => this.schedule(id, 100),
          (error) => {
            if (this.active.get(id) !== runtime) return;
            runtime.error = safeCode(error);
            this.changed();
          },
        );
        if (this.active.get(id) !== runtime || this.closing) {
          await handle.close();
          return this.snapshot();
        }
        runtime.handle = handle;
        const interval = this.options.reconcileMs ?? 30000;
        if (interval > 0) {
          runtime.interval = setInterval(() => {
            void this.reconcile(id);
          }, interval);
          runtime.interval.unref();
        }
        this.changed();
        await this.reconcile(id);
      } catch (error) {
        await this.pause(id);
        throw error;
      }
      return this.snapshot();
    } finally {
      this.starting.delete(id);
    }
  }
  private exclusions(): string[] {
    return [this.options.workspace, ...this.store.list().map((rule) => rule.output_dir)];
  }
  private schedule(id: string, delay: number): void {
    const runtime = this.active.get(id);
    if (!runtime || this.closing || runtime.timer) return;
    runtime.timer = setTimeout(() => {
      runtime.timer = undefined;
      void this.reconcile(id);
    }, delay);
    runtime.timer.unref();
  }
  async reconcile(id: string): Promise<void> {
    const runtime = this.active.get(id);
    if (!runtime || this.closing) return;
    if (runtime.inFlight) return runtime.inFlight;
    runtime.inFlight = this.scan(id, runtime).finally(() => {
      runtime.inFlight = undefined;
    });
    return runtime.inFlight;
  }
  private async scan(id: string, runtime: Runtime): Promise<void> {
    const current = () =>
      !this.closing && this.active.get(id) === runtime && this.options.authorize();
    let pending = false;
    runtime.scanning = true;
    runtime.error = null;
    runtime.errorFile = null;
    this.changed();
    try {
      this.allowed();
      const rule = this.store.get(id);
      await validateRoots(rule, this.options.workspace);
      const entries = await collectFiles(
        rule,
        this.exclusions(),
        new Set(this.queue.outputPaths()),
      );
      const baseline = this.store.baseline(id);
      const visible = new Set(entries.map((entry) => entry.path));
      for (const name of runtime.observed.keys())
        if (!visible.has(name)) {
          runtime.observed.delete(name);
          runtime.checked.delete(name);
        }
      for (const entry of entries) {
        if (!current()) break;
        if (
          baseline.get(entry.path) === entry.fingerprint ||
          runtime.checked.get(entry.path) === entry.fingerprint
        )
          continue;
        const before = runtime.observed.get(entry.path);
        if (!before || before.fingerprint !== entry.fingerprint) {
          runtime.observed.set(entry.path, { fingerprint: entry.fingerprint, since: this.now() });
          pending = true;
          continue;
        }
        if (this.now() - before.since < this.stableMs) {
          pending = true;
          continue;
        }
        try {
          // File-size stability is a heuristic, not proof a producer has closed
          // its handle. Recheck after hashing; worker verifies again at execution.
          const sha256 = await hashFile(entry.path);
          const after = await fileEntry(entry.path);
          if (!after || after.fingerprint !== entry.fingerprint) {
            runtime.observed.delete(entry.path);
            pending = true;
            continue;
          }
          if (!current()) break;
          if (!this.store.seen(id, sha256)) {
            this.options.protectSource?.(entry.path);
            const jobId = this.queue.admitFolder(admissionId(id, sha256), {
              video: { path: entry.path, name: path.basename(entry.path), sha256 },
              output_dir: rule.output_dir,
              encoding: 'review',
              ...(rule.processing
                ? { processing: rule.processing, processing_models: rule.processing_models }
                : {}),
            });
            // If this commit fails, the next scan reuses the same batch job ID.
            this.store.acknowledge(id, sha256, jobId);
          }
          runtime.checked.set(entry.path, entry.fingerprint);
        } catch (error) {
          runtime.error = safeCode(error);
          runtime.errorFile = path.basename(entry.path);
        }
      }
      runtime.lastScan = this.now();
    } catch (error) {
      runtime.error = safeCode(error);
    } finally {
      runtime.scanning = false;
      if (this.active.get(id) === runtime) {
        this.changed();
        if (pending) this.schedule(id, this.stableMs);
      }
    }
  }
  async pause(id: string): Promise<FolderSnapshot> {
    this.store.get(id);
    this.starting.delete(id);
    const runtime = this.active.get(id);
    this.active.delete(id);
    if (runtime) {
      clearTimeout(runtime.timer);
      clearInterval(runtime.interval);
      try {
        await runtime.handle?.close();
      } finally {
        await runtime.inFlight;
      }
    }
    this.changed();
    return this.snapshot();
  }
  async close(): Promise<void> {
    this.closing = true;
    this.starting.clear();
    await Promise.all([...this.active.keys()].map((id) => this.pause(id)));
    await Promise.allSettled([...this.pendingStarts]);
    this.store.close();
  }
}
