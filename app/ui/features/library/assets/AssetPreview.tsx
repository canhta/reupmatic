import { Button } from '@astryxdesign/core/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LibraryAssetPreview } from '../../../../core/library/library-types';

export function AssetPreview({ value }: { value: LibraryAssetPreview }) {
  const { t } = useTranslation();
  const [offset, setOffset] = useState(0);
  return (
    <section className="library-asset-preview" aria-label={t('assetPreview')}>
      <h3>{value.name}</h3>
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
          <p className="field-help">{t('assetSubtitleReadOnly')}</p>
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
                      <span className="library-cue-text">{cue.text}</span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="action-row">
            <span>
              {t('libraryPage', {
                from: value.cues.length ? offset + 1 : 0,
                to: Math.min(offset + 100, value.cues.length),
                total: value.cues.length,
              })}
            </span>
            <Button
              label={t('libraryPrevious')}
              isDisabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 100))}
            />
            <Button
              label={t('libraryNext')}
              isDisabled={offset + 100 >= value.cues.length}
              onClick={() => setOffset(offset + 100)}
            />
          </div>
        </>
      )}
    </section>
  );
}
