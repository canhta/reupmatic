import { Button } from '@astryxdesign/core/Button';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { useTranslation } from 'react-i18next';
import type { BatchDraft } from '../../../core/batch/batch-types';

interface Props {
  items: BatchDraft[];
  busy: boolean;
  onAttach: (key: string) => Promise<void>;
  onRemoveSubtitle: (key: string) => void;
  onRemoveVideo: (key: string) => void;
}

export function BatchDraftTable({ items, busy, onAttach, onRemoveSubtitle, onRemoveVideo }: Props) {
  const { t } = useTranslation();
  return (
    <div className="batch-scroll">
      <Table density="compact" verticalAlign="top" aria-label={t('batchDraftNote')}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell scope="col">{t('batchVideo')}</TableHeaderCell>
            <TableHeaderCell scope="col">{t('batchSubtitle')}</TableHeaderCell>
            <TableHeaderCell scope="col">{t('batchActions')}</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.draft_key}>
              <TableCell>
                <span className="queue-file">{item.name}</span>
              </TableCell>
              <TableCell>{item.subtitle_name ?? t('batchNoSubtitle')}</TableCell>
              <TableCell>
                <div className="action-row">
                  <Button
                    label={t('batchAttachSrt')}
                    isDisabled={busy}
                    onClick={() => void onAttach(item.draft_key)}
                  />
                  {item.subtitle_id && (
                    <Button
                      label={t('batchRemoveSrt')}
                      isDisabled={busy}
                      onClick={() => onRemoveSubtitle(item.draft_key)}
                    />
                  )}
                  <Button
                    label={t('batchRemoveVideo')}
                    isDisabled={busy}
                    onClick={() => onRemoveVideo(item.draft_key)}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
