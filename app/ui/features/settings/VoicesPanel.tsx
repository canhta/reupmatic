import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CLONING_ENGINES, type ClonedVoiceMeta } from '../../../core/speech/voices';
import { unwrap } from '../../bridge/client';
import { useConfirmation } from '../../design-system/ConfirmationProvider';
import { useNotifications } from '../../shell/NotificationsProvider';
import { synthesisErrorKey } from '../speech/synthesis/error-message';
import { offeredModelErrorKey } from './offered-model-error-message';

type CloudVoices = { model_id: string; voices: { id: string; label: string }[] } | null;

const ENGINE_LABELS: Record<string, string> = { 'vieneu-v3-turbo-onnx': 'Turbo' };
const CLONE_CATALOGUE_ID = 'vieneu-v3-turbo-clone';

export function VoicesPanel() {
  const { t } = useTranslation();
  const confirm = useConfirmation();
  const { raiseError } = useNotifications();
  const [cloned, setCloned] = useState<ClonedVoiceMeta[] | null>(null);
  const [cloud, setCloud] = useState<CloudVoices>(null);
  const [localModelId, setLocalModelId] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; id: string } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [error, setError] = useState('');
  const [cloning, setCloning] = useState(false);
  const [renaming, setRenaming] = useState<ClonedVoiceMeta | null>(null);
  const [cloneReady, setCloneReady] = useState(false);
  const [installing, setInstalling] = useState(false);
  const installRequest = useRef<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const [voices, cloudVoices, status, offered] = await Promise.all([
        unwrap(window.reupmatic.synthesisVoiceList()),
        unwrap(window.reupmatic.synthesisCloudVoices()),
        unwrap(window.reupmatic.synthesisStatus()),
        unwrap(window.reupmatic.speechOfferedModels()),
      ]);
      if (alive.current) {
        setCloned(voices);
        setCloud(cloudVoices);
        setLocalModelId(status.model_id);
        setCloneReady(
          Boolean(offered.models.find((model) => model.id === CLONE_CATALOGUE_ID)?.installed),
        );
      }
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    }
  }, []);

  async function installClone() {
    if (installing) return;
    setInstalling(true);
    setError('');
    try {
      const { request_id } = await unwrap(
        window.reupmatic.speechModelInstallStart(CLONE_CATALOGUE_ID),
      );
      installRequest.current = request_id;
    } catch (reason) {
      setInstalling(false);
      raiseError(
        t(offeredModelErrorKey(reason instanceof Error ? reason.message : 'WORKER_FAILURE')),
      );
    }
  }

  async function previewVoice(voiceId: string, modelId: string | null, language: 'en' | 'vi') {
    if (!modelId || previewBusy) return;
    setPreviewBusy(true);
    setError('');
    try {
      const value = await unwrap(
        window.reupmatic.synthesisVoicePreview(voiceId, modelId, language),
      );
      if (alive.current) setPreview({ url: value.url, id: voiceId });
    } catch (reason) {
      raiseError(t(synthesisErrorKey(reason instanceof Error ? reason.message : 'WORKER_FAILURE')));
    } finally {
      if (alive.current) setPreviewBusy(false);
    }
  }

  useEffect(() => {
    void reload();
    const offVoices = window.reupmatic.onSynthesisVoicesChanged(() => void reload());
    const offModels = window.reupmatic.onSynthesisModelsChanged(() => void reload());
    const offInstall = window.reupmatic.onSpeechModelInstall((message) => {
      if (message.id !== installRequest.current) return;
      if (message.event === 'progress') return;
      installRequest.current = null;
      setInstalling(false);
      if (message.event === 'error') setError(message.data.code);
      void reload();
    });
    return () => {
      offVoices();
      offModels();
      offInstall();
    };
  }, [reload]);

  async function remove(voice: ClonedVoiceMeta) {
    if (
      !(await confirm(t('settingsVoicesRemoveConfirm', { name: voice.name }), {
        title: t('confirmRemoveTitle'),
        confirmLabel: t('settingsVoicesRemove'),
        destructive: true,
      }))
    )
      return;
    try {
      await unwrap(window.reupmatic.synthesisVoiceRemove(voice.id));
      void reload();
    } catch (reason) {
      raiseError(t(synthesisErrorKey(reason instanceof Error ? reason.message : 'WORKER_FAILURE')));
    }
  }

  const hasAny = (cloned?.length ?? 0) > 0 || (cloud?.voices.length ?? 0) > 0;

  return (
    <VStack gap={3}>
      <HStack gap={3} hAlign="between" vAlign="center">
        <Heading level={2}>{t('settingsVoicesTitle')}</Heading>
        <Button label={t('settingsVoicesClone')} size="sm" onClick={() => setCloning(true)} />
      </HStack>
      <Text as="p" type="supporting">
        {t('settingsVoicesHelp')}
      </Text>
      {error && (
        <Banner
          status="error"
          title={t('settingsVoicesFailed')}
          description={<code>{error}</code>}
        />
      )}
      {cloned === null && !error && (
        <Text as="p" type="body" role="status">
          {t('settingsVoicesLoading')}
        </Text>
      )}
      {cloned !== null && !hasAny && (
        <EmptyState
          isCompact
          title={t('settingsVoicesTitle')}
          description={t('settingsVoicesEmpty')}
          actions={
            <Button label={t('settingsVoicesClone')} size="sm" onClick={() => setCloning(true)} />
          }
        />
      )}
      {(cloned?.length ?? 0) > 0 && (
        <List hasDividers density="compact">
          {cloned?.map((voice) => (
            <ListItem
              key={voice.id}
              label={voice.name}
              description={`${t('settingsVoicesSourceCloned')} · ${ENGINE_LABELS[voice.engine] ?? voice.engine}`}
              endContent={
                <HStack gap={1}>
                  <Button
                    size="sm"
                    variant="ghost"
                    label={`${voice.name}: ${t('settingsVoicesPreview')}`}
                    isDisabled={!localModelId || previewBusy}
                    onClick={() => void previewVoice(voice.id, localModelId, voice.language)}
                  >
                    {t('settingsVoicesPreview')}
                  </Button>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`${voice.name}: ${t('settingsVoicesRename')}`}
                    icon={<Icon icon={Pencil} size="sm" />}
                    onClick={() => setRenaming(voice)}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`${voice.name}: ${t('settingsVoicesRemove')}`}
                    icon={<Icon icon={Trash2} size="sm" />}
                    onClick={() => void remove(voice)}
                  />
                </HStack>
              }
            />
          ))}
        </List>
      )}
      <VStack gap={2}>
        <Heading level={3}>{t('settingsVoicesCloudTitle')}</Heading>
        {cloud === null && (
          <Text as="p" type="body">
            {t('settingsVoicesCloudMissingKey')}
          </Text>
        )}
        {cloud !== null && cloud.voices.length === 0 && (
          <Text as="p" type="body">
            {t('settingsVoicesCloudEmpty')}
          </Text>
        )}
        {cloud !== null && cloud.voices.length > 0 && (
          <List hasDividers density="compact">
            {cloud.voices.map((voice) => (
              <ListItem
                key={voice.id}
                label={voice.label}
                description={t('settingsVoicesSourceCloud')}
                endContent={
                  <Button
                    size="sm"
                    variant="ghost"
                    label={`${voice.label}: ${t('settingsVoicesPreview')}`}
                    isDisabled={previewBusy}
                    onClick={() => void previewVoice(voice.id, cloud.model_id, 'vi')}
                  >
                    {t('settingsVoicesPreview')}
                  </Button>
                }
              />
            ))}
          </List>
        )}
        <VStack gap={1}>
          <Text as="p" type="supporting">
            {t('settingsVoicesCloudHelp')}
          </Text>
          <HStack>
            <Button
              size="sm"
              variant="secondary"
              label={t('settingsVoicesOpenStudio')}
              onClick={() => void unwrap(window.reupmatic.synthesisOpenStudio())}
            />
          </HStack>
        </VStack>
      </VStack>
      {preview && <audio controls autoPlay src={preview.url} aria-label={t('synthesisPlayer')} />}
      {cloning && (
        <CloneVoiceDialog
          cloneReady={cloneReady}
          installing={installing}
          onInstall={() => void installClone()}
          onClose={() => setCloning(false)}
          onCloned={() => {
            setCloning(false);
            void reload();
          }}
        />
      )}
      {renaming && (
        <RenameVoiceDialog
          voice={renaming}
          onClose={() => setRenaming(null)}
          onRenamed={() => {
            setRenaming(null);
            void reload();
          }}
        />
      )}
    </VStack>
  );
}

function CloneVoiceDialog({
  cloneReady,
  installing,
  onInstall,
  onClose,
  onCloned,
}: {
  cloneReady: boolean;
  installing: boolean;
  onInstall: () => void;
  onClose: () => void;
  onCloned: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [engine, setEngine] = useState(CLONING_ENGINES[0]);
  const [language, setLanguage] = useState<'en' | 'vi'>('vi');
  const [attested, setAttested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function clone() {
    setBusy(true);
    setError('');
    try {
      const created = await unwrap(
        window.reupmatic.synthesisVoiceClone({ name, engine, language, attested: true }),
      );
      if (created) onCloned();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      setBusy(false);
    }
  }

  const canClone = cloneReady && name.trim().length > 0 && attested && !busy && !installing;

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={480}>
      <DialogHeader
        title={t('settingsVoicesCloneTitle')}
        onOpenChange={(open) => !open && onClose()}
      />
      <FormLayout>
        {!cloneReady && (
          <Banner
            status="warning"
            title={t('settingsVoicesCloneInstallTitle')}
            description={t('settingsVoicesCloneInstallHelp')}
            endContent={
              <Button
                size="sm"
                label={
                  installing ? t('settingsVoicesCloneInstalling') : t('settingsVoicesCloneInstall')
                }
                isDisabled={installing}
                onClick={onInstall}
              />
            }
          />
        )}
        <TextInput
          label={t('settingsVoicesName')}
          value={name}
          onChange={setName}
          isRequired
          hasAutoFocus
        />
        <Selector
          label={t('settingsVoicesEngine')}
          value={engine}
          onChange={(value) => value && setEngine(value as typeof engine)}
          options={CLONING_ENGINES.map((value) => ({
            value,
            label: ENGINE_LABELS[value] ?? value,
          }))}
          isRequired
        />
        <Selector
          label={t('settingsVoicesLanguage')}
          value={language}
          onChange={(value) => (value === 'en' || value === 'vi') && setLanguage(value)}
          options={[
            { value: 'vi', label: 'Tiếng Việt' },
            { value: 'en', label: 'English' },
          ]}
          isRequired
        />
        <CheckboxInput
          label={t('settingsVoicesAttest')}
          value={attested}
          onChange={setAttested}
          isRequired
        />
        <Text as="p" type="supporting">
          {t('settingsVoicesReferenceHelp')}
        </Text>
        {error && (
          <Banner
            status="error"
            title={t('settingsVoicesFailed')}
            description={t(synthesisErrorKey(error))}
          />
        )}
        <HStack gap={2}>
          <Button
            label={busy ? t('settingsVoicesCloning') : t('settingsVoicesChooseFile')}
            isDisabled={!canClone}
            onClick={() => void clone()}
          />
          <Button variant="secondary" label={t('cancel')} isDisabled={busy} onClick={onClose} />
        </HStack>
      </FormLayout>
    </Dialog>
  );
}

function RenameVoiceDialog({
  voice,
  onClose,
  onRenamed,
}: {
  voice: ClonedVoiceMeta;
  onClose: () => void;
  onRenamed: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(voice.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      await unwrap(window.reupmatic.synthesisVoiceRename(voice.id, name));
      onRenamed();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={400}>
      <DialogHeader
        title={t('settingsVoicesRenameTitle')}
        onOpenChange={(open) => !open && onClose()}
      />
      <FormLayout>
        <TextInput
          label={t('settingsVoicesName')}
          value={name}
          onChange={setName}
          isRequired
          hasAutoFocus
        />
        {error && (
          <Banner
            status="error"
            title={t('settingsVoicesFailed')}
            description={t(synthesisErrorKey(error))}
          />
        )}
        <HStack gap={2}>
          <Button
            label={t('settingsVoicesRename')}
            isDisabled={name.trim().length === 0 || busy}
            onClick={() => void save()}
          />
          <Button variant="secondary" label={t('cancel')} isDisabled={busy} onClick={onClose} />
        </HStack>
      </FormLayout>
    </Dialog>
  );
}
