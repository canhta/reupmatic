import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { Grid } from '@astryxdesign/core/Grid';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { InputGroup, InputGroupText } from '@astryxdesign/core/InputGroup';
import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { OverflowList } from '@astryxdesign/core/OverflowList';
import { Popover } from '@astryxdesign/core/Popover';
import { StackItem } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  Dot,
} from 'lucide-react';
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useContinuousEdit } from './ContinuousEdit';
import { PanelRow, PanelRows } from './Panel';

// Stored colour is exactly #RRGGBB (core parser); a native color input emits that shape.
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * Colour: a native swatch beside its hex, one row (Astryx has no colour input). A pick streams at
 * most one value per frame and lands as one edit when the picker commits or loses focus.
 */
export function ColorRow({
  label,
  value,
  isInvalid,
  isDisabled,
  onChange,
}: {
  label: string;
  value: string;
  isInvalid?: boolean;
  isDisabled?: boolean;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const edit = useContinuousEdit(onChange);
  const swatch = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const element = swatch.current;
    if (!element) return undefined;
    // React's onChange is the input event; the native change event is the picker's commit.
    const commit = () => {
      edit.end();
      setDraft(null);
    };
    element.addEventListener('change', commit);
    element.addEventListener('blur', commit);
    return () => {
      element.removeEventListener('change', commit);
      element.removeEventListener('blur', commit);
    };
  }, [edit]);
  const shown = draft ?? value;
  return (
    <InputGroup
      label={label}
      isDisabled={isDisabled}
      status={isInvalid ? { type: 'error', message: t('styleColorInvalid') } : undefined}
    >
      <InputGroupText>
        <input
          ref={swatch}
          type="color"
          className="panel-color-swatch"
          aria-label={`${label} – ${t('stylePickColor')}`}
          disabled={isDisabled}
          value={HEX_COLOR.test(shown) ? shown : '#000000'}
          onChange={(event) => {
            const next = event.target.value.toUpperCase();
            setDraft(next);
            edit.push(next);
          }}
        />
      </InputGroupText>
      <TextInput label={t('styleHex')} value={shown} isDisabled={isDisabled} onChange={onChange} />
    </InputGroup>
  );
}

const CELL_ICON = [
  ArrowUpLeft,
  ArrowUp,
  ArrowUpRight,
  ArrowLeft,
  Dot,
  ArrowRight,
  ArrowDownLeft,
  ArrowDown,
  ArrowDownRight,
];

/** Nine anchors, top-left to bottom-right: the user picks the spot instead of reading its name. */
export function PositionGrid<Value extends string | number>({
  label,
  value,
  cells,
  isDisabled,
  onChange,
}: {
  label: string;
  value: Value;
  /** Exactly nine, in reading order. */
  cells: { value: Value; label: string }[];
  isDisabled?: boolean;
  onChange: (value: Value) => void;
}) {
  return (
    <PanelRow label={label}>
      <Grid columns={3} gap={1} width="fit-content">
        {cells.map((cell, index) => (
          <ToggleButton
            key={String(cell.value)}
            label={cell.label}
            size="sm"
            isIconOnly
            icon={<Icon icon={CELL_ICON[index]} size="sm" />}
            isPressed={cell.value === value}
            isDisabled={isDisabled}
            onPressedChange={() => onChange(cell.value)}
          />
        ))}
      </Grid>
    </PanelRow>
  );
}

export interface FilterFacet {
  key: string;
  /** Set when the facet narrows the list; counted on the overflow trigger while it is hidden. */
  isActive: boolean;
  /** Inline, the control sits in the bar with its label hidden; otherwise it is a labelled row. */
  render(inline: boolean): ReactNode;
}

/**
 * Facets on one row above a list; those that do not fit move into an "N more" popover as
 * label-left rows. A hidden active facet still shows: the trigger carries their count.
 */
export function FilterBar({
  label,
  facets,
  end,
}: {
  label: string;
  facets: FilterFacet[];
  /** After the facets, such as Clear all. */
  end?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <Toolbar
      label={label}
      size="sm"
      startContent={
        <>
          <OverflowList
            gap={1}
            className="filter-bar-facets"
            overflowRenderer={(hidden) => {
              const active = hidden.filter(({ index }) => facets[index].isActive).length;
              return (
                <Popover
                  label={label}
                  width={320}
                  content={
                    <PanelRows>
                      {hidden.map(({ index }) => (
                        <Fragment key={facets[index].key}>{facets[index].render(false)}</Fragment>
                      ))}
                    </PanelRows>
                  }
                >
                  <Button
                    variant="ghost"
                    label={
                      active > 0
                        ? t('filterMoreActive', { count: hidden.length, active })
                        : t('filterMore', { count: hidden.length })
                    }
                    endContent={active > 0 ? <Badge variant="info" label={active} /> : undefined}
                  >
                    {t('filterMore', { count: hidden.length })}
                  </Button>
                </Popover>
              );
            }}
          >
            {facets.map((facet) => (
              <Fragment key={facet.key}>{facet.render(true)}</Fragment>
            ))}
          </OverflowList>
          {end}
        </>
      }
    />
  );
}

/**
 * A multi-select list's bulk actions: the count and Clear, then the actions with the one primary
 * last. Renders nothing while nothing is selected.
 */
export function SelectionBar({
  count,
  isDisabled = false,
  onClear,
  children,
}: {
  count: number;
  /** Disables Clear, such as while the selection is being processed. */
  isDisabled?: boolean;
  onClear: () => void;
  /** The bulk actions; the last is the one primary. */
  children: ReactNode;
}) {
  const { t } = useTranslation();
  if (count === 0) return null;
  const text = t('selectionCount', { count });
  return (
    <Toolbar
      label={text}
      size="sm"
      variant="muted"
      startContent={
        <>
          <Text type="body" role="status" hasTabularNumbers>
            {text}
          </Text>
          <Button
            variant="ghost"
            label={t('selectionClear')}
            isDisabled={isDisabled}
            onClick={onClear}
          />
        </>
      }
      endContent={children}
    />
  );
}

/**
 * A picked file or folder: the path on one line, truncated with the full path on hover, then
 * Choose; with onClear, Clear sits in ⋯.
 */
export function PathRow({
  label,
  value,
  chooseLabel,
  isDisabled = false,
  onChoose,
  onClear,
}: {
  label: string;
  /** The picked path or name; empty shows None. */
  value: string | null | undefined;
  /** Choose's accessible name, naming what it picks, such as "Choose output folder". */
  chooseLabel: string;
  isDisabled?: boolean;
  onChoose: () => void;
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <PanelRow label={label}>
      <HStack gap={2} vAlign="center">
        <StackItem size="fill">
          <Text type="body" maxLines={1} color={value ? undefined : 'secondary'}>
            {value || t('pathNone')}
          </Text>
        </StackItem>
        <Button label={chooseLabel} size="sm" isDisabled={isDisabled} onClick={onChoose}>
          {t('pathChoose')}
        </Button>
        {onClear && (
          <MoreMenu
            label={`${label}: ${t('moreActions')}`}
            size="sm"
            alignment="end"
            items={[{ label: t('pathClear'), isDisabled: isDisabled || !value, onClick: onClear }]}
          />
        )}
      </HStack>
    </PanelRow>
  );
}
