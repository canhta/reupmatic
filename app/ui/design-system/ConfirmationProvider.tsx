import { AlertDialog } from '@astryxdesign/core/AlertDialog';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

interface Confirmation {
  description: string;
  finish: (accepted: boolean) => void;
}

type Confirm = (description: string) => Promise<boolean>;
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

  const confirm = useCallback<Confirm>(description => {
    if (!mounted.current || current.current) return Promise.resolve(false);
    return new Promise<boolean>(finish => {
      const request = { description, finish };
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
        title={t('confirmActionTitle')}
        description={pending?.description ?? ''}
        cancelLabel={t('cancel')}
        actionLabel={t('confirmActionAccept')}
        actionVariant="primary"
        onOpenChange={open => { if (!open) finish(false); }}
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
