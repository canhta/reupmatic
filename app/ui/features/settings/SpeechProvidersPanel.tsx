import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { FormLayout } from '@astryxdesign/core/FormLayout';
import { Heading } from '@astryxdesign/core/Heading';
import { HStack } from '@astryxdesign/core/HStack';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { List, ListItem } from '@astryxdesign/core/List';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { NumberInput } from '@astryxdesign/core/NumberInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { Pencil, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { SpeechProvider, SpeechProviderModel } from '../../../core/speech/providers';
import type { SpeechLanguage } from '../../../core/speech/recognition';
import { unwrap } from '../../bridge/client';
import { providerErrorKey } from './provider-error-message';

type ProviderDraft = { display_name: string; protocol: string; endpoint_host: string };
type ModelDraft = { remote_model_name: string; languages: string[]; max_duration_s: number };

const emptyProviderDraft: ProviderDraft = { display_name: '', protocol: '', endpoint_host: '' };
const emptyModelDraft: ModelDraft = { remote_model_name: '', languages: [], max_duration_s: 60 };

type PanelDialog =
  | { kind: 'provider-add' }
  | { kind: 'provider-edit'; provider: SpeechProvider }
  | { kind: 'provider-remove'; provider: SpeechProvider }
  | { kind: 'models'; provider: SpeechProvider };

export function SpeechProvidersPanel() {
  const { t } = useTranslation();
  const [providers, setProviders] = useState<SpeechProvider[] | null>(null);
  const [protocols, setProtocols] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<PanelDialog | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    try {
      const [list, implemented] = await Promise.all([
        unwrap(window.reupmatic.speechProvidersList()),
        unwrap(window.reupmatic.speechProviderProtocols()),
      ]);
      if (alive.current) {
        setProviders(list);
        setProtocols(implemented);
      }
    } catch (reason) {
      if (alive.current) setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    }
  }, []);

  useEffect(() => {
    void reload();
    return window.reupmatic.onSpeechModelsChanged(() => void reload());
  }, [reload]);

  // No add affordance until a protocol is implemented in code; stored providers stay removable.
  const canAdd = protocols.length > 0;
  if (providers !== null && providers.length === 0 && !canAdd && !error) return null;

  return (
    <VStack gap={3}>
      <HStack gap={3} hAlign="between" vAlign="center">
        <Heading level={2}>{t('settingsProvidersTitle')}</Heading>
        {canAdd && (
          <Button
            label={t('settingsProviderAdd')}
            size="sm"
            onClick={() => setDialog({ kind: 'provider-add' })}
          />
        )}
      </HStack>
      <Text as="p" type="supporting">
        {t('settingsProvidersHelp')}
      </Text>
      {error && (
        <Banner
          status="error"
          title={t('settingsProvidersTitle')}
          description={t(providerErrorKey(error))}
        />
      )}
      {providers === null && !error && (
        <Text as="p" type="body" role="status">
          {t('settingsProvidersLoading')}
        </Text>
      )}
      {providers !== null && providers.length === 0 && (
        <EmptyState
          isCompact
          title={t('settingsProvidersEmptyTitle')}
          description={t('settingsProvidersEmptyDescription')}
          actions={
            canAdd ? (
              <Button
                label={t('settingsProviderAdd')}
                size="sm"
                onClick={() => setDialog({ kind: 'provider-add' })}
              />
            ) : undefined
          }
        />
      )}
      {providers !== null && providers.length > 0 && (
        <List header={t('settingsProvidersTitle')} hasDividers density="compact">
          {providers.map((provider) => (
            <ListItem
              key={provider.id}
              label={provider.display_name}
              description={t('settingsProviderSummary', {
                protocol: provider.protocol,
                host: provider.endpoint_host,
                credential: t(
                  provider.has_credential
                    ? 'settingsProviderCredentialSet'
                    : 'settingsProviderCredentialMissing',
                ),
              })}
              endContent={
                <HStack gap={1}>
                  <Button
                    size="sm"
                    variant="ghost"
                    label={`${provider.display_name}: ${t('settingsProviderManageModels')}`}
                    onClick={() => setDialog({ kind: 'models', provider })}
                  >
                    {t('settingsProviderModelCount', { count: provider.models.length })}
                  </Button>
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`${provider.display_name}: ${t('settingsProviderEdit')}`}
                    icon={<Icon icon={Pencil} size="sm" />}
                    onClick={() => setDialog({ kind: 'provider-edit', provider })}
                  />
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`${provider.display_name}: ${t('settingsProviderRemove')}`}
                    icon={<Icon icon={Trash2} size="sm" />}
                    onClick={() => setDialog({ kind: 'provider-remove', provider })}
                  />
                </HStack>
              }
            />
          ))}
        </List>
      )}
      {dialog?.kind === 'provider-add' && (
        <ProviderFormDialog
          protocols={protocols}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void reload();
          }}
        />
      )}
      {dialog?.kind === 'provider-edit' && (
        <ProviderFormDialog
          protocols={protocols}
          provider={dialog.provider}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void reload();
          }}
        />
      )}
      {dialog?.kind === 'provider-remove' && (
        <RemoveProviderDialog
          provider={dialog.provider}
          onClose={() => setDialog(null)}
          onRemoved={() => {
            setDialog(null);
            void reload();
          }}
        />
      )}
      {dialog?.kind === 'models' && (
        <ProviderModelsDialog
          provider={dialog.provider}
          onClose={() => setDialog(null)}
          onChanged={() => void reload()}
        />
      )}
    </VStack>
  );
}

function ProviderFormDialog({
  protocols,
  provider,
  onClose,
  onSaved,
}: {
  protocols: string[];
  provider?: SpeechProvider;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ProviderDraft>(
    provider
      ? {
          display_name: provider.display_name,
          protocol: provider.protocol,
          endpoint_host: provider.endpoint_host,
        }
      : emptyProviderDraft,
  );
  const [credential, setCredential] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    try {
      if (provider) {
        await unwrap(window.reupmatic.speechProviderUpdate(provider.id, draft));
        if (credential)
          await unwrap(window.reupmatic.speechProviderCredentialSet(provider.id, credential));
      } else {
        await unwrap(window.reupmatic.speechProviderAdd(draft, credential));
      }
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      setBusy(false);
    }
  }

  const canSave =
    draft.display_name.length > 0 &&
    draft.protocol.length > 0 &&
    draft.endpoint_host.length > 0 &&
    (provider ? true : credential.length > 0);

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={480}>
      <DialogHeader
        title={t(provider ? 'settingsProviderEditTitle' : 'settingsProviderAddTitle')}
        onOpenChange={(open) => !open && onClose()}
      />
      <FormLayout>
        <TextInput
          label={t('settingsProviderDisplayName')}
          value={draft.display_name}
          onChange={(value) => setDraft((current) => ({ ...current, display_name: value }))}
          isRequired
          hasAutoFocus
        />
        <Selector
          label={t('settingsProviderProtocol')}
          value={draft.protocol}
          onChange={(value) => setDraft((current) => ({ ...current, protocol: value ?? '' }))}
          options={protocols}
          emptyText={t('settingsProviderProtocolEmpty')}
          placeholder={t('settingsProviderProtocolPlaceholder')}
          isRequired
        />
        <TextInput
          label={t('settingsProviderEndpointHost')}
          value={draft.endpoint_host}
          onChange={(value) => setDraft((current) => ({ ...current, endpoint_host: value }))}
          isRequired
          placeholder="api.example.com"
        />
        <TextInput
          type="password"
          label={t(provider ? 'settingsProviderCredentialReplace' : 'settingsProviderCredential')}
          description={
            provider
              ? t(
                  provider.has_credential
                    ? 'settingsProviderCredentialSet'
                    : 'settingsProviderCredentialMissing',
                )
              : undefined
          }
          value={credential}
          onChange={setCredential}
          isRequired={!provider}
          isOptional={Boolean(provider)}
          autoComplete="new-password"
        />
        {error && (
          <Banner
            status="error"
            title={t('settingsProviderSaveFailed')}
            description={t(providerErrorKey(error))}
          />
        )}
        <HStack gap={2}>
          <Button
            label={t('settingsProviderSave')}
            isDisabled={!canSave || busy}
            onClick={() => void save()}
          />
          <Button variant="secondary" label={t('cancel')} isDisabled={busy} onClick={onClose} />
        </HStack>
      </FormLayout>
    </Dialog>
  );
}

function RemoveProviderDialog({
  provider,
  onClose,
  onRemoved,
}: {
  provider: SpeechProvider;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function remove() {
    setBusy(true);
    setError('');
    try {
      await unwrap(window.reupmatic.speechProviderRemove(provider.id));
      onRemoved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
      setBusy(false);
    }
  }
  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="required" width={420}>
      <DialogHeader
        title={t('settingsProviderRemove')}
        onOpenChange={(open) => !open && onClose()}
      />
      <Text as="p" type="body">
        {t('settingsProviderRemoveConfirm', { name: provider.display_name })}
      </Text>
      {error && (
        <Banner
          status="error"
          title={t('settingsProviderSaveFailed')}
          description={t(providerErrorKey(error))}
        />
      )}
      <HStack gap={2}>
        <Button
          variant="destructive"
          label={t('settingsProviderRemove')}
          isDisabled={busy}
          onClick={() => void remove()}
        />
        <Button variant="secondary" label={t('cancel')} isDisabled={busy} onClick={onClose} />
      </HStack>
    </Dialog>
  );
}

function ProviderModelsDialog({
  provider,
  onClose,
  onChanged,
}: {
  provider: SpeechProvider;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState(provider);
  const [form, setForm] = useState<
    { mode: 'add' } | { mode: 'edit'; model: SpeechProviderModel } | null
  >(null);
  const [removing, setRemoving] = useState<SpeechProviderModel | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function removeModel(model: SpeechProviderModel) {
    setBusy(true);
    setError('');
    try {
      const updated = await unwrap(
        window.reupmatic.speechProviderModelRemove(current.id, model.id),
      );
      setCurrent(updated);
      setRemoving(null);
      onChanged();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} purpose="form" width={520}>
      <DialogHeader
        title={t('settingsProviderModelsTitle', { name: current.display_name })}
        onOpenChange={(open) => !open && onClose()}
      />
      {!form && (
        <>
          {error && (
            <Banner
              status="error"
              title={t('settingsProviderSaveFailed')}
              description={t(providerErrorKey(error))}
            />
          )}
          {current.models.length === 0 && (
            <EmptyState
              isCompact
              title={t('settingsModelsEmptyTitle')}
              description={t('settingsModelsEmptyDescription')}
              actions={
                <Button label={t('settingsModelAdd')} onClick={() => setForm({ mode: 'add' })} />
              }
            />
          )}
          {current.models.length > 0 && (
            <List
              header={t('settingsProviderModelsTitle', { name: current.display_name })}
              hasDividers
              density="compact"
            >
              {current.models.map((model) => (
                <ListItem
                  key={model.id}
                  label={model.remote_model_name}
                  description={t('settingsModelSummary', {
                    languages: model.languages.join(', '),
                    seconds: Math.round(model.max_duration_ms / 1000),
                  })}
                  endContent={
                    <HStack gap={1}>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`${model.remote_model_name}: ${t('settingsModelEdit')}`}
                        icon={<Icon icon={Pencil} size="sm" />}
                        onClick={() => setForm({ mode: 'edit', model })}
                      />
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`${model.remote_model_name}: ${t('settingsModelRemove')}`}
                        icon={<Icon icon={Trash2} size="sm" />}
                        onClick={() => setRemoving(model)}
                      />
                    </HStack>
                  }
                />
              ))}
            </List>
          )}
          <HStack gap={2}>
            {current.models.length > 0 && (
              <Button label={t('settingsModelAdd')} onClick={() => setForm({ mode: 'add' })} />
            )}
            <Button variant="secondary" label={t('settingsProviderClose')} onClick={onClose} />
          </HStack>
          {removing && (
            <Banner
              status="warning"
              title={t('settingsModelRemoveConfirm', { name: removing.remote_model_name })}
              endContent={
                <HStack gap={2}>
                  <Button
                    variant="destructive"
                    size="sm"
                    label={t('settingsModelRemove')}
                    isDisabled={busy}
                    onClick={() => void removeModel(removing)}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    label={t('cancel')}
                    onClick={() => setRemoving(null)}
                  />
                </HStack>
              }
            />
          )}
        </>
      )}
      {form && (
        <ModelForm
          providerId={current.id}
          model={form.mode === 'edit' ? form.model : undefined}
          onCancel={() => setForm(null)}
          onSaved={(updated) => {
            setCurrent(updated);
            setForm(null);
            onChanged();
          }}
        />
      )}
    </Dialog>
  );
}

function ModelForm({
  providerId,
  model,
  onCancel,
  onSaved,
}: {
  providerId: string;
  model?: SpeechProviderModel;
  onCancel: () => void;
  onSaved: (provider: SpeechProvider) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ModelDraft>(
    model
      ? {
          remote_model_name: model.remote_model_name,
          languages: model.languages,
          max_duration_s: Math.round(model.max_duration_ms / 1000),
        }
      : emptyModelDraft,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setBusy(true);
    setError('');
    const payload = {
      remote_model_name: draft.remote_model_name,
      languages: draft.languages as SpeechLanguage[],
      max_duration_ms: draft.max_duration_s * 1000,
    };
    try {
      const provider = model
        ? await unwrap(window.reupmatic.speechProviderModelUpdate(providerId, model.id, payload))
        : await unwrap(window.reupmatic.speechProviderModelAdd(providerId, payload));
      onSaved(provider);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'WORKER_FAILURE');
    } finally {
      setBusy(false);
    }
  }

  const canSave =
    draft.remote_model_name.length > 0 && draft.languages.length > 0 && draft.max_duration_s > 0;

  return (
    <FormLayout>
      <TextInput
        label={t('settingsModelRemoteName')}
        value={draft.remote_model_name}
        onChange={(value) => setDraft((current) => ({ ...current, remote_model_name: value }))}
        isRequired
        hasAutoFocus
      />
      <MultiSelector
        label={t('settingsModelLanguages')}
        value={draft.languages}
        onChange={(value) => setDraft((current) => ({ ...current, languages: value }))}
        options={[
          { value: 'en', label: t('settingsModelLanguageEn') },
          { value: 'vi', label: t('settingsModelLanguageVi') },
          { value: 'zh', label: t('settingsModelLanguageZh') },
        ]}
        isRequired
      />
      <NumberInput
        label={t('settingsModelMaxDuration')}
        value={draft.max_duration_s}
        onChange={(value) => setDraft((current) => ({ ...current, max_duration_s: value }))}
        min={1}
        max={7199}
        units="s"
        isRequired
      />
      {error && (
        <Banner
          status="error"
          title={t('settingsProviderSaveFailed')}
          description={t(providerErrorKey(error))}
        />
      )}
      <HStack gap={2}>
        <Button
          label={t('settingsModelSave')}
          isDisabled={!canSave || busy}
          onClick={() => void save()}
        />
        <Button variant="secondary" label={t('cancel')} isDisabled={busy} onClick={onCancel} />
      </HStack>
    </FormLayout>
  );
}
