import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useEffect, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type {
  TikTokCreatorSettings,
  TikTokPostOptions as TikTokPostOptionsValue,
} from '../../../core/distribution/publishing/contracts';
import {
  TIKTOK_DEFAULT_OPTIONS,
  tiktokDisclosure,
} from '../../../core/distribution/publishing/tiktok';
import { unwrap } from '../../bridge/client';
import { type CommandStatus, PanelRows, PanelSection, ToggleRow } from '../../design-system/Panel';
import { tiktokPrivacyKey } from './publish-copy';

// TikTok's own copies of the policies the consent declaration links to.
const MUSIC_USAGE_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const BRANDED_CONTENT_POLICY_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

export interface TikTokCreator {
  settings: TikTokCreatorSettings | null;
  /** The failed creator-info query's error code, or null. */
  error: string | null;
  retry(): void;
}

/** Creator info for the post being edited; re-queried each time a TikTok post opens (null = none). */
export function useTikTokCreator(channelId: string | null): TikTokCreator {
  const [settings, setSettings] = useState<TikTokCreatorSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a retry bumps the generation.
  useEffect(() => {
    setSettings(null);
    setError(null);
    if (!channelId) return;
    let alive = true;
    void unwrap(window.reupmatic.tiktokCreatorInfo(channelId))
      .then((value) => {
        if (alive) setSettings(value);
      })
      .catch((reason: unknown) => {
        if (alive) setError((reason instanceof Error && reason.message) || 'PUBLISH_FAILED');
      });
    return () => {
      alive = false;
    };
  }, [channelId, generation]);
  return { settings, error, retry: () => setGeneration((value) => value + 1) };
}

// TikTok's mandatory per-post choices: privacy has no default, interaction toggles start off, and
// the consent declaration shows on every post, so the panel loads creator info before publishing.
export function TikTokPostOptions({
  creator,
  value,
  onChange,
  disabled,
}: {
  creator: TikTokCreator;
  value: TikTokPostOptionsValue | null;
  onChange(value: TikTokPostOptionsValue): void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { settings, error } = creator;
  const options: TikTokPostOptionsValue = { ...TIKTOK_DEFAULT_OPTIONS, ...value };
  const patch = (next: Partial<TikTokPostOptionsValue>) => onChange({ ...options, ...next });
  const unavailable = disabled || settings === null;
  // Branded content cannot be private: Only me is offered but disabled while it is on.
  const privacyOptions = (settings?.privacy_level_options ?? []).map((option) => {
    const blocked = option === 'SELF_ONLY' && options.brand_content_toggle;
    return {
      value: option,
      label: t(tiktokPrivacyKey(option)),
      disabled: blocked,
      ...(blocked ? { description: t('tiktokPrivacyBrandedBlocked') } : {}),
    };
  });
  // Spam-risk refusals map to PUBLISH_RATE_LIMITED: TikTok asks to stop and try again later.
  const status: CommandStatus = error
    ? {
        tone: 'error',
        text: t(error === 'PUBLISH_RATE_LIMITED' ? 'tiktokCannotPost' : 'tiktokOptionsError'),
      }
    : settings
      ? { tone: 'neutral', text: t('tiktokPostingAs', { name: settings.nickname }) }
      : { tone: 'neutral', text: t('catalogLoading') };

  return (
    <PanelSection title={t('platform_tiktok')} status={status}>
      <PanelRows>
        <Selector
          label={t('tiktokPrivacy')}
          value={options.privacy_level}
          isDisabled={unavailable}
          placeholder={t('tiktokPrivacyChoose')}
          options={privacyOptions}
          onChange={(privacy_level) => patch({ privacy_level })}
        />
        <ToggleRow
          label={t('tiktokAllowComment')}
          value={options.allow_comment && settings?.comment_disabled !== true}
          isDisabled={unavailable || settings?.comment_disabled === true}
          onChange={(allow_comment) => patch({ allow_comment })}
        />
        <ToggleRow
          label={t('tiktokAllowDuet')}
          value={options.allow_duet && settings?.duet_disabled !== true}
          isDisabled={unavailable || settings?.duet_disabled === true}
          onChange={(allow_duet) => patch({ allow_duet })}
        />
        <ToggleRow
          label={t('tiktokAllowStitch')}
          value={options.allow_stitch && settings?.stitch_disabled !== true}
          isDisabled={unavailable || settings?.stitch_disabled === true}
          onChange={(allow_stitch) => patch({ allow_stitch })}
        />
        <ToggleRow
          label={t('tiktokIsAigc')}
          value={options.is_aigc}
          isDisabled={unavailable}
          onChange={(is_aigc) => patch({ is_aigc })}
        />
      </PanelRows>
      <Text as="p" type="body">
        {/* Trans fills each link with its translated text. */}
        <Trans
          i18nKey={options.brand_content_toggle ? 'tiktokConsentBranded' : 'tiktokConsentMusic'}
          components={{
            music: (
              <Link href={MUSIC_USAGE_URL} isExternalLink>
                {null}
              </Link>
            ),
            policy: (
              <Link href={BRANDED_CONTENT_POLICY_URL} isExternalLink>
                {null}
              </Link>
            ),
          }}
        />
      </Text>
    </PanelSection>
  );
}

// Commercial content disclosure, off by default; on, at least one of Your brand and Branded
// content is required. The label notice is TikTok's required copy, so it stays full wrapping text.
export function TikTokDisclosure({
  creator,
  value,
  onChange,
  disabled,
}: {
  creator: TikTokCreator;
  value: TikTokPostOptionsValue | null;
  onChange(value: TikTokPostOptionsValue): void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const options: TikTokPostOptionsValue = { ...TIKTOK_DEFAULT_OPTIONS, ...value };
  const patch = (next: Partial<TikTokPostOptionsValue>) => onChange({ ...options, ...next });
  const unavailable = disabled || creator.settings === null;
  const disclosure = tiktokDisclosure(options);
  // Only me rules out branded content, as branded content rules out Only me.
  const privateOnly = options.privacy_level === 'SELF_ONLY';

  return (
    <PanelSection
      title={t('tiktokDisclose')}
      isOn={options.disclose}
      isDisabled={unavailable}
      onToggle={(disclose) =>
        patch(
          disclose
            ? { disclose }
            : { disclose, brand_content_toggle: false, brand_organic_toggle: false },
        )
      }
    >
      <PanelRows>
        <ToggleRow
          label={t('tiktokYourBrand')}
          value={options.brand_organic_toggle}
          isDisabled={unavailable}
          onChange={(brand_organic_toggle) => patch({ brand_organic_toggle })}
        />
        <ToggleRow
          label={t('tiktokBrandedContent')}
          value={options.brand_content_toggle}
          isDisabled={unavailable || (privateOnly && !options.brand_content_toggle)}
          onChange={(brand_content_toggle) => patch({ brand_content_toggle })}
        />
      </PanelRows>
      {disclosure && (
        <Text as="p" type="body">
          {t(
            disclosure === 'paid_partnership'
              ? 'tiktokDisclosurePaid'
              : 'tiktokDisclosurePromotional',
          )}
        </Text>
      )}
      {privateOnly && (
        <Text as="p" type="body">
          {t('tiktokPrivacyBrandedBlocked')}
        </Text>
      )}
    </PanelSection>
  );
}
