import { NumberInput } from '@astryxdesign/core/NumberInput';

interface Props {
  value: number;
  label: string;
  onCommit: (milliseconds: number) => void;
  onFocus: () => void;
}

export function TimeInput({ value, label, onCommit, onFocus }: Props) {
  return (
    <NumberInput
      label={label}
      isLabelHidden
      value={value / 1000}
      step={0.001}
      units="s"
      width="100%"
      isWheelEnabled={false}
      onFocus={onFocus}
      onChange={(seconds) => onCommit(Math.round(seconds * 1000))}
    />
  );
}
