import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { HStack } from '@astryxdesign/core/HStack';
import { ProgressBar } from '@astryxdesign/core/ProgressBar';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Post, PublicationPrivacy } from '../../../core/distribution/distribution-contracts';
import type { NamedProblem } from '../../../core/distribution/publishing/contracts';
import { unwrap } from '../../bridge/client';
import { useCatalog } from '../catalog/CatalogProvider';
import { problemKey, publishErrorKey } from './publish-copy';

const PRIVACY_KEYS: Record<PublicationPrivacy, string> = {
  public: 'publishPrivacyPublic',
  private: 'publishPrivacyPrivate',
  unlisted: 'publishPrivacyUnlisted',
};

export function PostPublication({
  post,
  onUpdated,
  disabled,
}: {
  post: Post;
  onUpdated(post: Post): void;
  disabled: boolean;
}) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalog();
  const [problems, setProblems] = useState<NamedProblem[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const channel = catalog.snapshot?.channels.find((item) => item.id === post.channel.id);
  const platform = post.channel.platform;
  const supported = platform === 'facebook_page' || platform === 'youtube' || platform === 'tiktok';
  const phase = post.publication?.phase ?? null;
  const blocking = (problems ?? []).filter((problem) => problem.severity === 'blocking');
  const warnings = (problems ?? []).filter((problem) => problem.severity === 'warning');
  const canStart = phase === null || phase === 'failed';
  const showPublish = supported && !!channel?.can_publish && canStart;
  const showCheck =
    supported && (phase === 'submitted' || phase === 'unknown' || phase === 'uploading');

  // biome-ignore lint/correctness/useExhaustiveDependencies: a publish bumps revision and preflight must re-run
  useEffect(() => {
    if (!supported) return;
    let alive = true;
    setProblems(null);
    void unwrap(window.reupmatic.postPreflight(post.id))
      .then((value) => {
        if (alive) setProblems(value);
      })
      .catch(() => {
        if (alive) setProblems([]);
      });
    return () => {
      alive = false;
    };
  }, [post.id, post.revision, supported]);

  useEffect(
    () =>
      window.reupmatic.onPublishProgress((event) => {
        if (event.post_id === post.id) setProgress(event.fraction);
      }),
    [post.id],
  );

  if (!supported || !channel) return null;

  async function publish() {
    setPublishing(true);
    setError('');
    setProgress(0);
    try {
      const updated = await unwrap(window.reupmatic.postPublish(post.id));
      onUpdated(updated);
      await catalog.reload();
    } catch (reason) {
      setError(publishErrorKey(reason instanceof Error ? reason.message : ''));
    } finally {
      setPublishing(false);
      setProgress(null);
    }
  }

  async function check() {
    setChecking(true);
    setError('');
    try {
      const updated = await unwrap(window.reupmatic.postReconcile(post.id));
      onUpdated(updated);
      await catalog.reload();
    } catch (reason) {
      setError(publishErrorKey(reason instanceof Error ? reason.message : ''));
    } finally {
      setChecking(false);
    }
  }

  async function openRemote() {
    setError('');
    try {
      await unwrap(window.reupmatic.postOpenRemote(post.id));
    } catch {
      setError(publishErrorKey('PUBLICATION_MISSING'));
    }
  }

  const scheduledTime = post.publication?.scheduled_for
    ? new Date(post.publication.scheduled_for).toLocaleString(i18n.language, {
        timeZone: post.planned?.timezone,
      })
    : null;

  return (
    <VStack gap={2}>
      <HStack gap={2} vAlign="center" wrap="wrap">
        <Text type="body">
          {t('postPublication')}: {phase ? t(`publishPhase_${phase}`) : t('postNotPublished')}
        </Text>
        {post.publication?.remote_url && (phase === 'published' || phase === 'scheduled') && (
          <Button label={t('postOpenPost')} onClick={() => void openRemote()} />
        )}
      </HStack>

      {post.publication?.privacy && (phase === 'published' || phase === 'scheduled') && (
        <Text as="p" type="supporting">
          {t('postPrivacy')}: {t(PRIVACY_KEYS[post.publication.privacy])}
        </Text>
      )}
      {phase === 'scheduled' && scheduledTime && (
        <Text as="p" type="body">
          {t('postScheduledFor', { time: scheduledTime })}
        </Text>
      )}
      {!channel.can_publish && phase === null && (
        <Text as="p" type="supporting">
          {t('postConnectionRequired')}
        </Text>
      )}
      {phase === 'unknown' && (
        <Text as="p" type="body">
          {t('postPublicationUnknown')}
        </Text>
      )}

      {publishing && (
        <>
          <ProgressBar
            value={Math.round((progress ?? 0) * 100)}
            max={100}
            label={t('postPublication')}
            hasValueLabel
          />
          <Text as="p" type="supporting">
            {progress !== null && progress < 1
              ? t('postPublishUploading', { percent: Math.round(progress * 100) })
              : t('postPublishFinishing')}
          </Text>
        </>
      )}

      {showPublish && problems === null && (
        <Text as="p" type="supporting">
          {t('postPreflightLoading')}
        </Text>
      )}
      {showPublish && (blocking.length > 0 || warnings.length > 0) && (
        <Banner status={blocking.length > 0 ? 'warning' : 'info'} title={t('postPreflightTitle')}>
          <VStack gap={1}>
            {[...blocking, ...warnings].map((problem) => (
              <Text as="p" type="body" key={problem.code}>
                {t(problemKey(problem.code, platform), problem.params ?? {})}
              </Text>
            ))}
          </VStack>
        </Banner>
      )}

      {showPublish && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button
            label={
              post.planned && platform !== 'tiktok' ? t('postPublishScheduled') : t('postPublish')
            }
            variant="primary"
            isDisabled={disabled || publishing || blocking.length > 0 || problems === null}
            onClick={() => void publish()}
          />
        </HStack>
      )}
      {(showCheck || phase === 'failed') && (
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Button
            label={t('postCheckStatus')}
            isDisabled={disabled || checking || publishing}
            onClick={() => void check()}
          />
        </HStack>
      )}

      {error && (
        <Text as="p" type="body" className="inline-error" role="alert">
          {error}
        </Text>
      )}
      {phase === 'failed' && post.publication?.error && (
        <Banner status="error" title={t('postPublishFailed')}>
          <Text as="p" type="body">
            {t(publishErrorKey(post.publication.error))}
          </Text>
        </Banner>
      )}
    </VStack>
  );
}
