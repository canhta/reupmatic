import type { DiagnosticRecorder } from '../../core/diagnostics/recorder.js';
import type { IpcWire } from './ipc.js';

/**
 * The renderer's intake into the host sink (D-61). It is deliberately thin: the operation's own
 * `validate` has already narrowed the payload, this is where the record is stamped as having
 * originated in the renderer, and the sink redacts it like every other producer's record.
 * Nothing here interprets the content.
 */
export function installDiagnosticIntake(wire: IpcWire, diagnostics: DiagnosticRecorder): void {
  wire('diagnostic-record', ({ module, ...entry }) => {
    diagnostics.record({ ...entry, source: { process: 'renderer', module } });
    return null;
  });
}
