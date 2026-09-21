import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { Icon } from '@astryxdesign/core/Icon';
import { HStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import { VStack } from '@astryxdesign/core/VStack';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DouyinConnectionStatus } from '../../../../core/sources/douyin-contracts';
import { useConfirmation } from '../../../design-system/ConfirmationProvider';
import { DouyinIcon } from './DouyinIcon';
import { douyinErrorKey } from './error-message';
import type { useDouyinSession } from './useDouyinSession';

const VARIANT: Record<DouyinConnectionStatus, 'success' | 'warning' | 'neutral'> = {
  connected: 'success',
  needs_reconnect: 'warning',
  not_connected: 'neutral',
};

const STATUS_KEY: Record<DouyinConnectionStatus, string> = {
  connected: 'downloadsStatusConnected',
  needs_reconnect: 'downloadsStatusNeedsReconnect',
  not_connected: 'downloadsStatusNotConnected',
};

/**
 * The Douyin source bar above the Downloads results: one full-width toolbar carrying the session
 * status, Connect/Reconnect/Disconnect, and the advanced cookie import behind a dialog. The
 * session is owned one level up so Search shares its status and busy flag, and the advanced entry
 * stays secondary by construction (SL-R03): Connect is the action, the dialog is the other way in,
 * and both write the same partition so nothing downstream can tell them apart.
 */
export function DouyinConnectionBar({ session }: { session: ReturnType<typeof useDouyinSession> }) {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const status = session.snapshot?.status ?? 'not_connected';
  const disabled = session.loading || session.busy;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paste, setPaste] = useState('');

  function closeDialog() {
    setDialogOpen(false);
    setPaste('');
  }

  async function handleImport() {
    const accepted = await session.importCookies(paste);
    // Cleared unconditionally: the paste is a session secret and must not linger in the DOM
    // after submission, whether or not the import was accepted.
    setPaste('');
    if (accepted) setDialogOpen(false);
  }

  async function handleDisconnect() {
    if (await confirm(t('downloadsDisconnectConfirm'))) await session.disconnect();
  }

  return (
    <VStack gap={2}>
      <Toolbar
        label={t('downloadsConnectionTitle')}
        size="sm"
        dividers={['bottom']}
        startContent={
          <VStack gap={1}>
            <HStack gap={2} vAlign="center">
              <Icon icon={DouyinIcon} size="sm" />
              <Text type="body" weight="semibold">
                {t('downloadsConnectionTitle')}
              </Text>
              <StatusDot variant={VARIANT[status]} label={t(STATUS_KEY[status])} />
              <Text type="body">{t(STATUS_KEY[status])}</Text>
            </HStack>
            {/* Only an expired session needs a sentence; "Not connected" is the Connect button's
                own state and needs no restating. */}
            {status === 'needs_reconnect' && (
              <Text type="supporting">{t('downloadsNeedsReconnectHelp')}</Text>
            )}
          </VStack>
        }
        endContent={
          <>
            {/* The advanced way in only matters while there is no live session to use (SL-R03);
                once connected it is clutter, so it stays hidden until a reconnect is needed. */}
            {status !== 'connected' && (
              <Button
                variant="ghost"
                label={t('downloadsAdvanced')}
                isDisabled={disabled}
                onClick={() => setDialogOpen(true)}
              />
            )}
            {status !== 'not_connected' && (
              <Button
                variant="destructive"
                label={t('downloadsDisconnect')}
                isDisabled={disabled}
                onClick={() => void handleDisconnect()}
              />
            )}
            <Button
              variant={status === 'connected' ? 'secondary' : 'primary'}
              label={status === 'not_connected' ? t('downloadsConnect') : t('downloadsReconnect')}
              isLoading={session.busy}
              isDisabled={disabled}
              onClick={() =>
                void (status === 'not_connected' ? session.connect() : session.reconnect())
              }
            />
          </>
        }
      />
      {/* A session error shows here while the bar is the visible surface; with the cookie dialog
          open, the same error renders inside it instead, so the message never hides behind the
          modal and never appears twice. */}
      {session.error && !dialogOpen && (
        <Banner status="error" title={t(douyinErrorKey(session.error))} />
      )}
      <Dialog
        isOpen={dialogOpen}
        onOpenChange={(next) => {
          if (!next) closeDialog();
        }}
        purpose="form"
        width={480}
      >
        <Layout
          header={
            <DialogHeader
              title={t('downloadsCookieDialogTitle')}
              onOpenChange={(next) => {
                if (!next) closeDialog();
              }}
            />
          }
          content={
            <LayoutContent>
              <VStack gap={2}>
                <TextArea
                  label={t('downloadsCookieLabel')}
                  description={t('downloadsCookieHelp')}
                  value={paste}
                  rows={3}
                  isDisabled={disabled}
                  onChange={setPaste}
                />
                {dialogOpen && session.error && (
                  <Banner status="error" title={t(douyinErrorKey(session.error))} />
                )}
              </VStack>
            </LayoutContent>
          }
          footer={
            <LayoutFooter>
              <HStack gap={2} hAlign="end">
                <Button
                  label={t('downloadsCookieCancel')}
                  isDisabled={disabled}
                  onClick={closeDialog}
                />
                <Button
                  variant="primary"
                  label={t('downloadsCookieSubmit')}
                  isLoading={session.busy}
                  isDisabled={disabled || paste.trim().length === 0}
                  onClick={() => void handleImport()}
                />
              </HStack>
            </LayoutFooter>
          }
        />
      </Dialog>
    </VStack>
  );
}
