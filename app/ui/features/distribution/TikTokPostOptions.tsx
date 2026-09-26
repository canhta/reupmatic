import { Banner } from '@astryxdesign/core/Banner';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Link } from '@astryxdesign/core/Link';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { VStack } from '@astryxdesign/core/VStack';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type {
  TikTokCreatorSettings,
  TikTokPostOptions as TikTokPostOptionsValue,
} from '../../../core/distribution/publishing/contracts';
import {
  TIKTOK_DEFAULT_OPTIONS,
  tiktokDisclosure,
} from '../../../core/distribution/publishing/tiktok';
import { unwrap } from '../../bridge/client';

// TikTok's own copies of the policies the consent declaration links to.
const MUSIC_USAGE_URL = 'https://www.tiktok.com/legal/page/global/music-usage-confirmation/en';
const BRANDED_CONTENT_POLICY_URL = 'https://www.tiktok.com/legal/page/global/bc-policy/en';

// TikTok's mandatory per-post choices: privacy has no default, interaction toggles start off, and
// commercial disclosure is opt-in, so the panel loads creator info before the user can publish.
export function TikTokPostOptions({
  channelId,
  value,
  onChange,
  disabled,
}: {
  channelId: string;
  value: TikTokPostOptionsValue | null;
  onChange(value: TikTokPostOptionsValue): void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TikTokCreatorSettings | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    setSettings(null);
    setError(false);
    try {
      setSettings(await unwrap(window.reupmatic.tiktokCreatorInfo(channelId)));
    } catch {
      setError(true);
    }
  }, [channelId]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error)
    return (
      <Banner
        status="error"
        title={t('tiktokOptionsError')}
        endContent={<Button label={t('retryLoad')} onClick={() => void load()} />}
      />
    );

  const options: TikTokPostOptionsValue = { ...TIKTOK_DEFAULT_OPTIONS, ...value };
  const patch = (next: Partial<TikTokPostOptionsValue>) => onChange({ ...options, ...next });
  const unavailable = disabled || settings === null;
  const disclosure = tiktokDisclosure(options);
  // A paid partnership cannot be private: SELF_ONLY is offered but disabled while it is on.
  const privacyOptions = (settings?.privacy_level_options ?? []).map((option) => ({
    value: option,
    label: option,
    disabled: option === 'SELF_ONLY' && options.brand_content_toggle,
  }));

  return (
    <VStack gap={3}>
      <Text as="p" type="body">
        {settings ? t('tiktokPostingAs', { name: settings.nickname }) : t('catalogLoading')}
      </Text>
      <Selector
        label={t('tiktokPrivacy')}
        value={options.privacy_level}
        isDisabled={unavailable}
        placeholder={t('tiktokPrivacyChoose')}
        options={privacyOptions}
        onChange={(privacy_level) => patch({ privacy_level })}
      />
      <CheckboxInput
        label={t('tiktokAllowComment')}
        value={options.allow_comment}
        isDisabled={unavailable || settings?.comment_disabled === true}
        onChange={(allow_comment) => patch({ allow_comment })}
      />
      <CheckboxInput
        label={t('tiktokAllowDuet')}
        value={options.allow_duet}
        isDisabled={unavailable || settings?.duet_disabled === true}
        onChange={(allow_duet) => patch({ allow_duet })}
      />
      <CheckboxInput
        label={t('tiktokAllowStitch')}
        value={options.allow_stitch}
        isDisabled={unavailable || settings?.stitch_disabled === true}
        onChange={(allow_stitch) => patch({ allow_stitch })}
      />
      <Switch
        label={t('tiktokDisclose')}
        description={t('tiktokDiscloseHelp')}
        value={options.disclose}
        isDisabled={unavailable}
        onChange={(disclose) =>
          patch(
            disclose
              ? { disclose }
              : { disclose, brand_content_toggle: false, brand_organic_toggle: false },
          )
        }
      />
      {options.disclose && (
        <VStack gap={2}>
          <CheckboxInput
            label={t('tiktokPromotionalContent')}
            value={options.brand_organic_toggle}
            isDisabled={unavailable}
            onChange={(brand_organic_toggle) => patch({ brand_organic_toggle })}
          />
          <CheckboxInput
            label={t('tiktokPaidPartnership')}
            value={options.brand_content_toggle}
            isDisabled={unavailable}
            onChange={(brand_content_toggle) => patch({ brand_content_toggle })}
          />
          {disclosure ? (
            <Text as="p" type="body">
              {disclosure === 'paid_partnership'
                ? t('tiktokDisclosurePaid')
                : t('tiktokDisclosurePromotional')}
            </Text>
          ) : (
            <Text as="p" type="supporting">
              {t('tiktokDisclosureRequired')}
            </Text>
          )}
          <Text as="p" type="supporting">
            {t('tiktokDisclosureConsent')}{' '}
            <Link href={MUSIC_USAGE_URL} isExternalLink>
              {t('tiktokMusicUsage')}
            </Link>
            {options.brand_content_toggle && (
              <>
                {' '}
                {t('tiktokAnd')}{' '}
                <Link href={BRANDED_CONTENT_POLICY_URL} isExternalLink>
                  {t('tiktokBrandedContentPolicy')}
                </Link>
              </>
            )}
          </Text>
          {options.brand_content_toggle && (
            <Text as="p" type="supporting">
              {t('tiktokPrivacyBrandedBlocked')}
            </Text>
          )}
        </VStack>
      )}
      <CheckboxInput
        label={t('tiktokIsAigc')}
        value={options.is_aigc}
        isDisabled={unavailable}
        onChange={(is_aigc) => patch({ is_aigc })}
      />
    </VStack>
  );
}
