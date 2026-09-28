import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { unwrap } from '../../bridge/client';
import { ValueRow } from '../../design-system/Panel';

/** The video a post will publish, played from its Library export; nothing while unavailable. */
export function PostPreview({ libraryId, exportId }: { libraryId: string; exportId: string }) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    setUrl(null);
    if (!libraryId || !exportId) return;
    let alive = true;
    void unwrap(window.reupmatic.libraryAssetPreview({ item_id: libraryId, link_id: exportId }))
      .then((preview) => {
        if (alive && preview.kind === 'export') setUrl(preview.url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [libraryId, exportId]);

  if (!url) return null;
  return (
    <ValueRow label={t('postPreview')}>
      <video
        key={url}
        className="post-preview"
        src={url}
        controls
        preload="metadata"
        aria-label={t('postPreview')}
      />
    </ValueRow>
  );
}
