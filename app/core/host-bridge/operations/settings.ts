import type { SettingsSnapshot } from '../../settings/settings-contracts.js';
import { operation } from '../operation-contract.js';

export const settingsOperations = {
  'settings-snapshot': operation<undefined, SettingsSnapshot>()({
    rendererMethod: 'settingsSnapshot',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'settings-pick-output': operation<undefined, SettingsSnapshot | null>()({
    rendererMethod: 'settingsPickOutput',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'settings-clear-output': operation<undefined, SettingsSnapshot>()({
    rendererMethod: 'settingsClearOutput',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'settings-pick-models': operation<undefined, SettingsSnapshot | null>()({
    rendererMethod: 'settingsPickModels',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'settings-cancel-models': operation<undefined, { requested: boolean }>()({
    rendererMethod: 'settingsCancelModels',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
} as const;
