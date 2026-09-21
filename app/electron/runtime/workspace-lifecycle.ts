import type { IpcWire } from './ipc.js';

/** A close-time module whose in-flight work must finish (or be cancelled) before quitting. */
export interface WorkspaceParticipant {
  readonly activeCount: number;
  close(): Promise<void>;
}

/** The narrower subset of participants that gets a chance to stop accepting new work before any
 * participant's `close()` runs — today only `batch` and `library`. */
export interface AdmissionParticipant {
  beginClose(): void | Promise<void>;
}

/**
 * One step in the ordered close sequence, before the guarded final step (see `finalClose`).
 * `'admission'` and `'participants'` (plural) run their members concurrently via
 * `Promise.allSettled` — a member's failure does not block the others. `'participant'` (singular)
 * and `'action'` run alone and unguarded: if either throws, the close sequence stops there and
 * every later step, including `finalClose` and destroying the window, does not run — matching the
 * plain sequential `await`s the equivalent host code used before this module existed.
 */
export type CloseStep =
  | { readonly kind: 'admission'; readonly participants: readonly AdmissionParticipant[] }
  | { readonly kind: 'participants'; readonly participants: readonly WorkspaceParticipant[] }
  | { readonly kind: 'participant'; readonly participant: WorkspaceParticipant }
  | { readonly kind: 'action'; readonly run: () => Promise<void> | void };

export type Language = 'en' | 'vi';
export type ConfirmKind = 'quit' | 'recovery-flush-failed';
/** `'save'` flushes the recovery draft then quits; `'discard'` quits without
 * flushing (the mac "Don't Save" convention — for `'recovery-flush-failed'`
 * the flush already failed, so `'discard'` there just means quit anyway);
 * `'cancel'` stays open. */
export type ConfirmChoice = 'save' | 'discard' | 'cancel';
/** What the confirm dialog needs to phrase itself correctly: whether there
 * are unsaved edits to offer saving (a `'quit'` prompt with nothing dirty
 * has no "save" concept — a running job is the only reason it's showing),
 * and whether quitting would stop work still in progress. */
export interface ConfirmContext {
  dirty: boolean;
  running: boolean;
}

/** The subset of `BrowserWindow` the lifecycle module actually needs, so tests can pass a plain
 * fake instead of a real or offscreen Electron window. */
export interface WorkspaceWindow {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): void;
  destroy(): void;
  isDestroyed(): boolean;
}

export interface WorkspaceLifecycleConfig {
  wire: IpcWire;
  /** Ordered close sequence run before `finalClose`; see `CloseStep` for per-kind guarantees. */
  steps: readonly CloseStep[];
  /** The last participant to close. Its `close()` is guarded so the window is destroyed even if it
   * fails — the one piece of the original close sequence that was ever guarded this way. */
  finalClose?: WorkspaceParticipant;
  /** Runs before the close-admission decision on every close attempt; a `false` result means the
   * latest draft could not be saved and the user must be asked whether to proceed anyway. */
  recoveryFlush(): Promise<boolean>;
  /** Asks the user what to do, with the given reason, current UI language and dirty/running
   * context (see `ConfirmContext`). */
  confirm(kind: ConfirmKind, language: Language, context: ConfirmContext): Promise<ConfirmChoice>;
  /** Runs whenever the renderer reports a new UI language via 'ui-locale', after `getLanguage()`
   * already reflects it — lets other host modules that render user-facing text of their own (the
   * native menu) rebuild without polling. */
  onLanguageChange?(language: Language): void;
}

export interface WorkspaceLifecycle {
  /** Installs the `close` listener and owns every close-time decision from here on. */
  attach(win: WorkspaceWindow): void;
  isClosing(): boolean;
  /** The renderer's last-reported UI language, for other host modules' own user-facing messages. */
  getLanguage(): Language;
}

export function createWorkspaceLifecycle(config: WorkspaceLifecycleConfig): WorkspaceLifecycle {
  const { wire, steps, finalClose, recoveryFlush, confirm, onLanguageChange } = config;
  let dirty = false;
  let language: Language = 'en';
  let closing = false;
  let closingAttempt = false;
  let confirmingClose = false;

  wire('session-dirty', (input) => {
    dirty = input.dirty;
    return null;
  });
  wire('ui-locale', (input) => {
    language = input.language;
    onLanguageChange?.(language);
    return null;
  });

  const participants = [
    ...steps.flatMap((step) => {
      if (step.kind === 'participants') return step.participants;
      if (step.kind === 'participant') return [step.participant];
      return [];
    }),
    ...(finalClose ? [finalClose] : []),
  ];
  const anyRunning = () => participants.some((participant) => participant.activeCount > 0);
  const busy = () => dirty || anyRunning();

  async function runStep(step: CloseStep): Promise<void> {
    if (step.kind === 'action') {
      await step.run();
      return;
    }
    if (step.kind === 'participant') {
      await step.participant.close();
      return;
    }
    await Promise.allSettled(
      step.kind === 'admission'
        ? step.participants.map((participant) => participant.beginClose())
        : step.participants.map((participant) => participant.close()),
    );
  }

  async function closeWorkspace(
    win: WorkspaceWindow,
    { skipFlush = false }: { skipFlush?: boolean } = {},
  ): Promise<void> {
    if (closing || closingAttempt) return;
    closingAttempt = true;
    if (!skipFlush && !(await recoveryFlush())) {
      const choice = await confirm('recovery-flush-failed', language, {
        dirty,
        running: anyRunning(),
      });
      if (choice === 'cancel') {
        closingAttempt = false;
        return;
      }
    }
    closing = true;
    try {
      for (const step of steps) await runStep(step);
    } catch {
      // A solo participant/action step threw: stop here, exactly like the original unguarded
      // `await`s did — the window is left un-destroyed and native close is used instead. This is
      // caught (rather than left as an unhandled rejection) purely so the failure is a controlled
      // stop, not a crash; it changes nothing the user can observe.
      return;
    }
    if (!finalClose) {
      win.destroy();
      return;
    }
    try {
      await finalClose.close();
    } finally {
      win.destroy();
    }
  }

  return {
    isClosing: () => closing,
    getLanguage: () => language,
    attach(win) {
      win.on('close', (event) => {
        if (closing) return;
        event.preventDefault();
        if (confirmingClose) return;
        if (!busy()) {
          void closeWorkspace(win);
          return;
        }
        confirmingClose = true;
        void confirm('quit', language, { dirty, running: anyRunning() })
          .then((choice) => {
            if (choice === 'cancel') return;
            return closeWorkspace(win, { skipFlush: choice === 'discard' });
          })
          .finally(() => {
            confirmingClose = false;
          });
      });
    },
  };
}
