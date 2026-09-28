import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

export interface ConfirmOptions {
  /** Names the action; defaults to a generic "confirm change" title. */
  title?: string;
  /** Verb on the action button; defaults to a generic "continue". */
  confirmLabel?: string;
  /** Deletion, discard or disconnect: renders the destructive action button. */
  destructive?: boolean;
}

interface Confirmation {
  description: string;
  options: ConfirmOptions;
  finish: (accepted: boolean) => void;
}

type Confirm = (description: string, options?: ConfirmOptions) => Promise<boolean>;
const ConfirmationContext = createContext<Confirm | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [pending, setPending] = useState<Confirmation | null>(null);
  const current = useRef<Confirmation | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      current.current?.finish(false);
      current.current = null;
    };
  }, []);

  const confirm = useCallback<Confirm>((description, options = {}) => {
    if (!mounted.current || current.current) return Promise.resolve(false);
    return new Promise<boolean>((finish) => {
      const request = { description, options, finish };
      current.current = request;
      setPending(request);
    });
  }, []);

  function finish(accepted: boolean) {
    const request = current.current;
    current.current = null;
    setPending(null);
    request?.finish(accepted);
  }

  return (
    <ConfirmationContext.Provider value={confirm}>
      {children}
      <AlertDialog
        isOpen={pending !== null}
        title={pending?.options.title ?? t('confirmActionTitle')}
        description={pending?.description ?? ''}
        cancelLabel={t('cancel')}
        actionLabel={pending?.options.confirmLabel ?? t('confirmActionAccept')}
        actionVariant={pending?.options.destructive ? 'destructive' : 'primary'}
        onOpenChange={(open) => {
          if (!open) finish(false);
        }}
        onAction={() => finish(true)}
      />
    </ConfirmationContext.Provider>
  );
}

export function useConfirmation(): Confirm {
  const confirm = useContext(ConfirmationContext);
  if (!confirm) throw new Error('Missing confirmation provider');
  return confirm;
}
