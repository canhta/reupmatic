import { Button } from '@astryxdesign/core/Button';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { useTranslation } from 'react-i18next';
import { CommandFooter, type CommandStatus } from '../../design-system/Panel';
import { DrawerFooter } from './ToolDrawer';

export interface GeneratorReadiness {
  /** Why the command cannot run here at all, such as on a composition; no Set up lifts it. */
  unavailable?: string;
  /** A missing or misconfigured model, translated: the one reason that offers Set up. */
  modelReason?: string;
  checking?: boolean;
  canSetUp?: boolean;
  onSetUp?: () => void;
  onRefresh?: () => void;
}

// A generator's one-row footer. A block no setup lifts (a composition) is the status and hides Set
// up. A model problem is the status otherwise and turns the primary into Set up, the only useful
// action then; the last error is the status after that. Why the command waits rides on its
// tooltip, and Check again in ⋯.
export function GeneratorFooter({
  readiness,
  active,
  error,
  errorLabel,
  notice,
  menu = [],
  cancel,
  primary,
}: {
  readiness: GeneratorReadiness;
  active: { phase: string; fraction: number | null } | null;
  error: string;
  errorLabel: string;
  /** A neutral fact worth seeing that does not block the command. */
  notice?: string;
  menu?: DropdownMenuOption[];
  cancel: () => void;
  primary: { label: string; isDisabled: boolean; blocked?: string; onClick: () => void };
}) {
  const { t } = useTranslation();
  const setUp = Boolean(
    !readiness.unavailable &&
      !readiness.checking &&
      readiness.modelReason &&
      readiness.canSetUp &&
      readiness.onSetUp,
  );
  const status: CommandStatus | null = readiness.unavailable
    ? { tone: 'warning', text: readiness.unavailable }
    : readiness.checking
      ? { tone: 'neutral', text: t('visionChecking') }
      : readiness.modelReason
        ? { tone: 'warning', text: readiness.modelReason }
        : error
          ? { tone: 'error', text: errorLabel }
          : notice
            ? { tone: 'neutral', text: notice }
            : null;
  const items: DropdownMenuOption[] = [
    ...menu,
    ...(readiness.onRefresh
      ? [
          {
            label: t('visionRefresh'),
            isDisabled: readiness.checking,
            onClick: readiness.onRefresh,
          },
        ]
      : []),
  ];
  return (
    <DrawerFooter>
      <CommandFooter status={status} menu={items} active={active} onCancel={cancel}>
        {setUp ? (
          <Button label={t('setUp')} variant="primary" onClick={() => readiness.onSetUp?.()} />
        ) : (
          <Button
            label={primary.label}
            variant="primary"
            isDisabled={primary.isDisabled}
            tooltip={
              primary.isDisabled
                ? (readiness.unavailable ?? primary.blocked ?? readiness.modelReason)
                : undefined
            }
            onClick={primary.onClick}
          />
        )}
      </CommandFooter>
    </DrawerFooter>
  );
}
