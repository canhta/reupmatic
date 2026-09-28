import { Banner } from '@astryxdesign/core/Banner';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Post, PublicationPrivacy } from '../../../core/distribution/distribution-contracts';
import type { NamedProblem } from '../../../core/distribution/publishing/contracts';
import { unwrap } from '../../bridge/client';
import { PanelRows, PanelSection, ValueRow } from '../../design-system/Panel';
import { useCatalog } from '../catalog/CatalogProvider';
import { problemKey, publishErrorKey } from './publish-copy';

const PRIVACY_KEYS: Record<PublicationPrivacy, string> = {
  public: 'publishPrivacyPublic',
  private: 'publishPrivacyPrivate',
  unlisted: 'publishPrivacyUnlisted',
};

// Publication lifecycle for the post drawer. The body renders its details and the footer its
// status and actions; both read one model so publish state and effects live in a single place.
export function usePostPublication(
  post: Post | undefined,
  onUpdated: (post: Post) => void,
  active: boolean,
) {
  const catalog = useCatalog();
  const [problems, setProblems] = useState<NamedProblem[] | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  const channel = catalog.snapshot?.channels.find((item) => item.id === post?.channel.id);
  const platform = post?.channel.platform;
  const supported =
    !!post && (platform === 'facebook_page' || platform === 'youtube' || platform === 'tiktok');
  const phase = post?.publication?.phase ?? null;
  const blocking = (problems ?? []).filter((problem) => problem.severity === 'blocking');
  const warnings = (problems ?? []).filter((problem) => problem.severity === 'warning');
  const canStart = phase === null || phase === 'failed';
  const showPublish = supported && !!channel?.can_publish && canStart;
  const showCheck =
    supported && (phase === 'submitted' || phase === 'unknown' || phase === 'uploading');
  const canOpen =
    !!post?.publication?.remote_url && (phase === 'published' || phase === 'scheduled');
  // TikTok requires telling the user that processing can take a few minutes after publishing.
  const processing = platform === 'tiktok' && phase === 'submitted';
  const hasDetails =
    supported &&
    !!channel &&
    (processing ||
      (!!post?.publication?.privacy && (phase === 'published' || phase === 'scheduled')) ||
      (phase === 'scheduled' && !!post?.publication?.scheduled_for) ||
      (showPublish && blocking.length + warnings.length > 0) ||
      !!error ||
      (phase === 'failed' && !!post?.publication?.error));

  // biome-ignore lint/correctness/useExhaustiveDependencies: a publish bumps revision and preflight must re-run
  useEffect(() => {
    if (!active || !post || !supported) return;
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
  }, [active, post?.id, post?.revision, supported]);

  useEffect(() => {
    const postId = post?.id;
    if (!active || !postId) return;
    return window.reupmatic.onPublishProgress((event) => {
      if (event.post_id === postId) setProgress(event.fraction);
    });
  }, [active, post?.id]);

  async function publish() {
    if (!post) return;
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
    if (!post) return;
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
    if (!post) return;
    setError('');
    try {
      await unwrap(window.reupmatic.postOpenRemote(post.id));
    } catch {
      setError(publishErrorKey('PUBLICATION_MISSING'));
    }
  }

  return {
    channel,
    platform,
    supported,
    phase,
    blocking,
    warnings,
    problems,
    publishing,
    checking,
    progress,
    error,
    showPublish,
    showCheck,
    canOpen,
    processing,
    hasDetails,
    publish,
    check,
    openRemote,
  };
}

export type PostPublicationModel = ReturnType<typeof usePostPublication>;

export function PostPublication({ post, model }: { post: Post; model: PostPublicationModel }) {
  const { t, i18n } = useTranslation();
  const { phase, blocking, warnings, error, showPublish, processing } = model;
  const privacy =
    post.publication?.privacy && (phase === 'published' || phase === 'scheduled')
      ? post.publication.privacy
      : null;
  const scheduledTime =
    phase === 'scheduled' && post.publication?.scheduled_for
      ? new Date(post.publication.scheduled_for).toLocaleString(i18n.language, {
          timeZone: post.planned?.timezone,
        })
      : null;

  return (
    <PanelSection title={t('postPublication')}>
      {processing && (
        <Text as="p" type="body">
          {t('tiktokProcessing')}
        </Text>
      )}
      {(privacy || scheduledTime) && (
        <PanelRows>
          {privacy && <ValueRow label={t('postPrivacy')}>{t(PRIVACY_KEYS[privacy])}</ValueRow>}
          {scheduledTime && <ValueRow label={t('postScheduledFor')}>{scheduledTime}</ValueRow>}
        </PanelRows>
      )}
      {showPublish && (blocking.length > 0 || warnings.length > 0) && (
        <Banner status={blocking.length > 0 ? 'warning' : 'info'} title={t('postPreflightTitle')}>
          <VStack gap={1}>
            {[...blocking, ...warnings].map((problem) => (
              <Text as="p" type="body" key={problem.code}>
                {t(problemKey(problem.code, post.channel.platform), problem.params ?? {})}
              </Text>
            ))}
          </VStack>
        </Banner>
      )}
      {error && (
        <Text as="p" type="body" className="inline-error" role="alert">
          {t(error)}
        </Text>
      )}
      {phase === 'failed' && post.publication?.error && (
        <Banner status="error" title={t('postPublishFailed')}>
          <Text as="p" type="body">
            {t(publishErrorKey(post.publication.error))}
          </Text>
        </Banner>
      )}
    </PanelSection>
  );
}
