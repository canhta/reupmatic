import { Button } from '@astryxdesign/core/Button';
import type { DropdownMenuOption } from '@astryxdesign/core/DropdownMenu';
import { Field } from '@astryxdesign/core/Field';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Grid } from '@astryxdesign/core/Grid';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Slider } from '@astryxdesign/core/Slider';
import { StackItem } from '@astryxdesign/core/Stack';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { RotateCcw } from 'lucide-react';
import {
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useContinuousEdit } from './ContinuousEdit';

// The panel grammar of docs/design/panels.md: sections of one-property rows, an on/off control and
// ↺ reset in the section header, and a one-row command footer.

/** A surface's on/off control: Switch where it takes effect instantly, CheckboxInput where the next run applies it. */
export type ToggleControl = ComponentType<{
  label: string;
  isLabelHidden?: boolean;
  value: boolean;
  isDisabled: boolean;
  onChange(value: boolean): void;
}>;

const PanelToggle = createContext<ToggleControl>(Switch);

/** Sets the on/off control of every section and ToggleRow below it; Switch without one. */
export function PanelToggleProvider({
  value,
  children,
}: {
  value: ToggleControl;
  children: ReactNode;
}) {
  return <PanelToggle value={value}>{children}</PanelToggle>;
}

/**
 * Sections of one panel, divided by a rule. The rule is drawn in CSS between rendered sections, so
 * a section that renders nothing leaves no divider behind.
 */
export function PanelSections({ children }: { children: ReactNode }) {
  return (
    <VStack gap={4} className="panel-sections">
      {children}
    </VStack>
  );
}

/** A full-page panel (Settings), capped to a readable width. */
export function PanelPage({ children }: { children: ReactNode }) {
  return (
    <VStack gap={4} className="panel-page">
      {children}
    </VStack>
  );
}

export function PanelSection({
  title,
  isOn,
  onToggle,
  onReset,
  isDisabled = false,
  actions,
  status,
  children,
}: {
  title: string;
  /** With onToggle, the surface's on/off control; the body shows only while it is on. */
  isOn?: boolean;
  onToggle?: (on: boolean) => void;
  /** Restores the section's defaults; omitted, there is no ↺. */
  onReset?: () => void;
  isDisabled?: boolean;
  /** Section-level list actions, such as Add. */
  actions?: ReactNode;
  /** Shown under the header even while the section is off, such as why it cannot switch on. */
  status?: CommandStatus | null;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const Toggle = useContext(PanelToggle);
  const open = !onToggle || Boolean(isOn);
  return (
    <VStack as="section" gap={2} aria-label={title}>
      <HStack gap={1} vAlign="center">
        <StackItem size="fill">
          <Heading level={5} maxLines={1}>
            {title}
          </Heading>
        </StackItem>
        {actions}
        {onReset && (
          <IconButton
            label={t('panelReset', { section: title })}
            tooltip={t('panelReset', { section: title })}
            variant="ghost"
            size="sm"
            isDisabled={isDisabled}
            icon={<Icon icon={RotateCcw} size="sm" />}
            onClick={onReset}
          />
        )}
        {onToggle && (
          <Toggle
            label={title}
            isLabelHidden
            value={Boolean(isOn)}
            isDisabled={isDisabled}
            onChange={(on) => onToggle(on)}
          />
        )}
      </HStack>
      {status && <PanelStatus tone={status.tone} text={status.text} />}
      {open && children}
    </VStack>
  );
}

/** One property per row: label left, control right. */
export function PanelRows({ children }: { children: ReactNode }) {
  return (
    <FormLayout direction="horizontal-labels" className="panel-rows">
      {children}
    </FormLayout>
  );
}

/**
 * A read-only fact as a row. Text sits on one line, truncated with the full value on hover; a
 * richer value (a timestamp, a status) renders as given.
 */
export function ValueRow({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const text = typeof children === 'string' || typeof children === 'number';
  return (
    <Field label={label} inputID={id} isGroupLabel>
      <Text as="div" type="body" display="block" id={id} className="panel-value">
        {text ? (
          <Text type="body" maxLines={1}>
            {children}
          </Text>
        ) : (
          children
        )}
      </Text>
    </Field>
  );
}

/** A row for a control that renders no field label of its own (segments, toggles, pairs). */
export function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <Field label={label} inputID={id} isGroupLabel>
      {/* Resets the row's own inputs to plain fields inside the label grid. */}
      <FormLayout direction="vertical">{children}</FormLayout>
    </Field>
  );
}

/**
 * Two values that are one pair (Start/End, In/Out, Left/Top) side by side. With a label it is a
 * row; without, it sits inside a list row that already names it.
 */
export function PanelPair({ label, children }: { label?: string; children: ReactNode }) {
  const pair = (
    <Grid columns={2} gap={1} className="panel-pair">
      {children}
    </Grid>
  );
  return label ? <PanelRow label={label}>{pair}</PanelRow> : pair;
}

/** An on/off property in a row, drawn with the surface's control. */
export function ToggleRow({
  label,
  value,
  isDisabled = false,
  onChange,
}: {
  label: string;
  value: boolean;
  isDisabled?: boolean;
  onChange(value: boolean): void;
}) {
  const Toggle = useContext(PanelToggle);
  return (
    <PanelRow label={label}>
      <Toggle
        label={label}
        isLabelHidden
        value={value}
        isDisabled={isDisabled}
        onChange={onChange}
      />
    </PanelRow>
  );
}

/** A value tuned by feel: drag the slider, or type the exact number. */
export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  units,
  marks,
  sliderRange,
  isDisabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  units?: string;
  marks?: { value: number; label?: string }[];
  /** The slider's narrower everyday range; the typed number still accepts min–max. */
  sliderRange?: [number, number];
  isDisabled?: boolean;
  onChange: (value: number) => void;
}) {
  // While dragging, the row shows its own draft and hands the document one value per frame.
  const [draft, setDraft] = useState<number | null>(null);
  const edit = useContinuousEdit(onChange);
  const shown = draft ?? value;
  return (
    <PanelRow label={label}>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Slider
            label={label}
            isLabelHidden
            value={shown}
            min={sliderRange?.[0] ?? min}
            max={sliderRange?.[1] ?? max}
            step={step}
            marks={marks}
            valueDisplay="none"
            isDisabled={isDisabled}
            onChange={(next: number) => {
              setDraft(next);
              edit.push(next);
            }}
            onChangeEnd={() => {
              edit.end();
              setDraft(null);
            }}
          />
        </StackItem>
        <NumberInput
          label={label}
          isLabelHidden
          value={shown}
          min={min}
          max={max}
          step={step}
          units={units}
          width="var(--panel-value-w)"
          isWheelEnabled={false}
          isDisabled={isDisabled}
          onChange={onChange}
        />
      </HStack>
    </PanelRow>
  );
}

export interface CommandStatus {
  tone: 'warning' | 'error' | 'neutral' | 'success';
  /** A short title (≤3 words); a longer one truncates with the full text on hover. */
  text: string;
}

/** One status line: a dot and a short title, then an optional inline action such as Keep. */
export function PanelStatus({
  tone,
  text,
  children,
}: CommandStatus & {
  children?: ReactNode;
}) {
  return (
    <HStack gap={2} vAlign="center" role="status">
      <StatusDot variant={tone} label={text} />
      <StackItem size="fill">
        <Text type="body" maxLines={1}>
          {text}
        </Text>
      </StackItem>
      {children}
    </HStack>
  );
}

/**
 * A panel's command row, always one row of one height: the status at the start, then ⋯ and the
 * primary; a running job's progress takes the status's place and Cancel the primary's. A reason
 * the primary waits belongs on its tooltip, not in the status. The caller places it in its
 * drawer's footer.
 */
export function CommandFooter({
  status,
  menu,
  menuLabel,
  active,
  onCancel,
  children,
}: {
  status?: CommandStatus | null;
  menu?: DropdownMenuOption[];
  menuLabel?: string;
  active?: { phase: string; fraction: number | null } | null;
  onCancel?: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <HStack gap={2} vAlign="center">
      <StackItem size="fill">
        {active ? (
          <ProgressBar
            label={t(active.phase)}
            isLabelHidden
            max={1}
            value={active.fraction ?? undefined}
            isIndeterminate={active.fraction === null}
          />
        ) : (
          status && <PanelStatus tone={status.tone} text={status.text} />
        )}
      </StackItem>
      {active ? (
        onCancel && (
          <Button
            label={t('cancel')}
            isDisabled={active.phase === 'cancelling'}
            onClick={onCancel}
          />
        )
      ) : (
        <>
          {menu && menu.length > 0 && (
            <MoreMenu label={menuLabel ?? t('moreActions')} items={menu} placement="above" />
          )}
          {children}
        </>
      )}
    </HStack>
  );
}
