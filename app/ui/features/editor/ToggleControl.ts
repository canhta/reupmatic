import type { ComponentType } from 'react';

/**
 * The on/off control a shared editing tool renders. The Editor passes Switch (the field previews
 * instantly); an automation profile passes CheckboxInput (the value applies to the next run), per
 * decision Q3. Each surface passes its own control, so the tool never branches on a flag.
 */
export type ToggleControl = ComponentType<{
  label: string;
  value: boolean;
  isDisabled: boolean;
  description?: string;
  onChange(value: boolean): void;
}>;
