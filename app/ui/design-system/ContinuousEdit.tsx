import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from 'react';
import { latestPerFrame } from '../../core/projects/continuous-edit';

/** How a surface groups a continuous control's changes: the Editor makes each gesture one undo entry. */
export interface EditGestures {
  begin(): string;
  end(id: string): void;
}

const NO_GESTURES: EditGestures = { begin: () => '', end: () => {} };
const Gestures = createContext<EditGestures>(NO_GESTURES);

export function EditGesturesProvider({
  value,
  children,
}: {
  value: EditGestures;
  children: ReactNode;
}) {
  return <Gestures value={value}>{children}</Gestures>;
}

const animationFrames = {
  request: (callback: () => void) => requestAnimationFrame(callback),
  cancel: (handle: number) => cancelAnimationFrame(handle),
};

/**
 * A continuous control's edit (a colour drag, a slider): `push` delivers at most one value per
 * frame to `onChange`, inside one gesture; `end` delivers the last value and closes the gesture.
 */
export function useContinuousEdit<T>(onChange: (value: T) => void) {
  const gestures = useContext(Gestures);
  const latest = useRef({ onChange, gestures });
  latest.current = { onChange, gestures };
  const open = useRef<string | null>(null);
  const [frames] = useState(() =>
    latestPerFrame<T>((value) => latest.current.onChange(value), animationFrames),
  );
  const [edit] = useState(() => ({
    push(value: T) {
      if (open.current === null) open.current = latest.current.gestures.begin();
      frames.push(value);
    },
    end() {
      frames.flush();
      if (open.current !== null) latest.current.gestures.end(open.current);
      open.current = null;
    },
  }));
  // A control removed mid-drag still lands its last value and closes its gesture.
  useEffect(() => () => edit.end(), [edit]);
  return edit;
}
