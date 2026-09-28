import type { IpcWire } from './ipc.js';

export interface WorkspaceParticipant {
  readonly activeCount: number;
  close(): Promise<void>;
}

export interface AdmissionParticipant {
  beginClose(): void | Promise<void>;
}

/** admission/participants run concurrently and tolerate failure; participant/action are unguarded. */
export type CloseStep =
  | { readonly kind: 'admission'; readonly participants: readonly AdmissionParticipant[] }
  | { readonly kind: 'participants'; readonly participants: readonly WorkspaceParticipant[] }
  | { readonly kind: 'participant'; readonly participant: WorkspaceParticipant }
  | { readonly kind: 'action'; readonly run: () => Promise<void> | void };

export type Language = 'en' | 'vi';
export type ConfirmKind = 'quit' | 'recovery-flush-failed';
/** save flushes then quits; discard quits without flushing; cancel stays open. */
export type ConfirmChoice = 'save' | 'discard' | 'cancel';
export interface ConfirmContext {
  dirty: boolean;
  running: boolean;
}

/** The subset of BrowserWindow the lifecycle needs; lets tests pass a plain fake. */
export interface WorkspaceWindow {
  on(event: 'close', listener: (event: { preventDefault(): void }) => void): void;
  destroy(): void;
  isDestroyed(): boolean;
}

export interface WorkspaceLifecycleConfig {
  wire: IpcWire;
  steps: readonly CloseStep[];
  /** The last participant to close; guarded so the window is destroyed even if it fails. */
  finalClose?: WorkspaceParticipant;
  recoveryFlush(): Promise<boolean>;
  confirm(kind: ConfirmKind, language: Language, context: ConfirmContext): Promise<ConfirmChoice>;
  /** Quit-dialog Save: writes the project file (Save As when it has none). False stays open. */
  saveWorkspace?(): Promise<boolean>;
  /** Quit-dialog Don't Save: drops the unsaved recovery draft. */
  discardWorkspace?(): Promise<void>;
  onLanguageChange?(language: Language): void;
}

export interface WorkspaceLifecycle {
  attach(win: WorkspaceWindow): void;
  isClosing(): boolean;
  getLanguage(): Language;
}

export function createWorkspaceLifecycle(config: WorkspaceLifecycleConfig): WorkspaceLifecycle {
  const { wire, steps, finalClose, recoveryFlush, confirm, onLanguageChange } = config;
  const { saveWorkspace, discardWorkspace } = config;
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
      // Solo step threw: stop, leave the window un-destroyed and let native close take over.
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
          .then(async (choice) => {
            if (choice === 'cancel') return;
            if (choice === 'save') {
              // Really write the project file; a cancelled Save As or a failed save stays open.
              if (saveWorkspace && !(await saveWorkspace())) return;
            } else if (discardWorkspace) {
              await discardWorkspace();
            }
            // Save already replaced the draft; Don't Save dropped it.
            const settled =
              choice === 'discard' || (choice === 'save' && saveWorkspace !== undefined);
            return closeWorkspace(win, { skipFlush: settled });
          })
          .finally(() => {
            confirmingClose = false;
          });
      });
    },
  };
}
