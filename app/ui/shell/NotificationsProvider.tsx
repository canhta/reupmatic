import { useToast } from '@astryxdesign/core/Toast';
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';

export type NotificationKind = 'error' | 'info';

export interface NotificationAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  message: string;
  time: number;
  read: boolean;
  actions: NotificationAction[];
  // Dedupe identity: a repeat of the same event refreshes its row instead of stacking.
  uniqueID?: string;
}

interface RaiseOptions {
  kind?: NotificationKind;
  uniqueID?: string;
  actions?: NotificationAction[];
}

interface NotificationStore {
  notifications: AppNotification[];
  unreadCount: number;
  raise(message: string, options?: RaiseOptions): string;
  raiseError(message: string, uniqueID?: string): string;
  markAllRead(): void;
  dismiss(id: string): void;
}

const MAX_NOTIFICATIONS = 50;
const NotificationContext = createContext<NotificationStore | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const showToast = useToast();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const raise = useCallback<NotificationStore['raise']>(
    (message, options = {}) => {
      const kind = options.kind ?? 'info';
      const record: AppNotification = {
        id: crypto.randomUUID(),
        kind,
        message,
        time: Date.now(),
        read: false,
        actions: options.actions ?? [],
        ...(options.uniqueID ? { uniqueID: options.uniqueID } : {}),
      };
      setNotifications((current) => {
        const kept = options.uniqueID
          ? current.filter((item) => item.uniqueID !== options.uniqueID)
          : current;
        return [record, ...kept].slice(0, MAX_NOTIFICATIONS);
      });
      showToast({ body: message, type: kind, uniqueID: options.uniqueID });
      return record.id;
    },
    [showToast],
  );

  const raiseError = useCallback<NotificationStore['raiseError']>(
    (message, uniqueID) => raise(message, { kind: 'error', uniqueID }),
    [raise],
  );

  const markAllRead = useCallback(() => {
    setNotifications((current) =>
      current.some((item) => !item.read)
        ? current.map((item) => (item.read ? item : { ...item, read: true }))
        : current,
    );
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((current) => current.filter((item) => item.id !== id));
  }, []);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications],
  );

  const value = useMemo<NotificationStore>(
    () => ({ notifications, unreadCount, raise, raiseError, markAllRead, dismiss }),
    [notifications, unreadCount, raise, raiseError, markAllRead, dismiss],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications(): NotificationStore {
  const store = useContext(NotificationContext);
  if (!store) throw new Error('Missing notification provider');
  return store;
}
