import type { DiagnosticRecorder } from '../../core/diagnostics/recorder.js';
import type { IpcWire } from './ipc.js';

export function installDiagnosticIntake(wire: IpcWire, diagnostics: DiagnosticRecorder): void {
  wire('diagnostic-record', ({ module, ...entry }) => {
    diagnostics.record({ ...entry, source: { process: 'renderer', module } });
    return null;
  });
}
