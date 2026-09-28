import { Badge } from '@astryxdesign/core/Badge';
import { Button } from '@astryxdesign/core/Button';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Heading } from '@astryxdesign/core/Heading';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { Popover } from '@astryxdesign/core/Popover';
import { Stack } from '@astryxdesign/core/Stack';
import { Timestamp } from '@astryxdesign/core/Timestamp';
import { Bell } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from './NotificationsProvider';

export function NotificationsButton() {
  const { t } = useTranslation();
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [isOpen, setIsOpen] = useState(false);
  const label =
    unreadCount > 0 ? t('notificationsUnread', { count: unreadCount }) : t('notificationsTitle');

  return (
    <Popover
      placement="above"
      alignment="end"
      label={t('notificationsTitle')}
      width={360}
      isOpen={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (open) markAllRead();
      }}
      content={
        <Stack direction="vertical" gap={2}>
          {}
          <Stack direction="horizontal" gap={2} hAlign="between" vAlign="center">
            <Heading level={5}>{t('notificationsTitle')}</Heading>
            <IconButton
              label={t('closeNotifications')}
              tooltip={t('closeNotifications')}
              variant="ghost"
              size="sm"
              icon={<Icon icon="close" size="sm" />}
              onClick={() => setIsOpen(false)}
            />
          </Stack>
          {notifications.length === 0 ? (
            <EmptyState
              isCompact
              title={t('notificationsEmpty')}
              icon={<Icon icon="info" size="sm" />}
            />
          ) : (
            <Stack direction="vertical" gap={0} isScrollable className="notifications-list">
              <List density="compact" hasDividers>
                {notifications.map((notification) => (
                  <ListItem
                    key={notification.id}
                    label={notification.message}
                    description={<Timestamp value={notification.time} format="relative" />}
                    startContent={
                      <Icon
                        icon={notification.kind === 'error' ? 'error' : 'info'}
                        size="sm"
                        color={notification.kind === 'error' ? 'error' : 'secondary'}
                      />
                    }
                    endContent={
                      notification.actions.length > 0 ? (
                        <Stack direction="horizontal" gap={1}>
                          {notification.actions.map((action) => (
                            <Button
                              key={action.label}
                              label={action.label}
                              size="sm"
                              variant={action.variant ?? 'secondary'}
                              onClick={action.onClick}
                            />
                          ))}
                        </Stack>
                      ) : undefined
                    }
                  />
                ))}
              </List>
            </Stack>
          )}
        </Stack>
      }
    >
      <IconButton
        label={label}
        tooltip={t('notificationsTitle')}
        variant="ghost"
        size="sm"
        icon={
          <>
            <Icon icon={Bell} size="sm" />
            {unreadCount > 0 && (
              <Badge
                variant="notificationCount"
                label={unreadCount > 99 ? '99+' : String(unreadCount)}
              />
            )}
          </>
        }
      />
    </Popover>
  );
}
