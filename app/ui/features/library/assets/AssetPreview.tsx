import { Heading } from '@astryxdesign/core/Heading';
import { Pagination } from '@astryxdesign/core/Pagination';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { Text } from '@astryxdesign/core/Text';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ContentAssetPreview } from '../../../../core/library/library-contracts';

export function AssetPreview({ value }: { value: ContentAssetPreview }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  return (
    <section className="library-asset-preview" aria-label={t('assetPreview')}>
      <Heading level={5}>{value.name}</Heading>
      {value.kind === 'export' && (
        <video
          key={value.url}
          src={value.url}
          controls
          preload="metadata"
          aria-label={value.name}
        />
      )}
      {value.kind === 'audio' && (
        <audio
          key={value.url}
          src={value.url}
          controls
          preload="metadata"
          aria-label={value.name}
        />
      )}
      {value.kind === 'subtitle' && (
        <>
          <Text as="p" type="supporting">
            {t('assetSubtitleReadOnly')}
          </Text>
          <div className="library-asset-cues">
            <Table density="compact" aria-label={value.name}>
              <TableHeader>
                <TableRow isHeaderRow>
                  <TableHeaderCell scope="col">{t('start')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('end')}</TableHeaderCell>
                  <TableHeaderCell scope="col">{t('text')}</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {value.cues.slice(offset, offset + 100).map((cue) => (
                  <TableRow key={cue.id}>
                    <TableCell>{(cue.start_ms / 1000).toFixed(3)}</TableCell>
                    <TableCell>{(cue.end_ms / 1000).toFixed(3)}</TableCell>
                    <TableCell>
                      <Text type="body" className="library-cue-text">
                        {cue.text}
                      </Text>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {value.cues.length > 100 && (
            <Pagination
              variant="count"
              size="sm"
              page={Math.floor(offset / 100) + 1}
              pageSize={100}
              totalItems={value.cues.length}
              onChange={(next) => setOffset((next - 1) * 100)}
            />
          )}
        </>
      )}
    </section>
  );
}
