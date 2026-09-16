import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableHeaderCell,
  TableRow,
} from '@astryxdesign/core/Table';
import { useTranslation } from 'react-i18next';
import type { LibraryItem } from '../../../core/library/library-types';

interface Props {
  items: LibraryItem[];
  selected: Set<string>;
  disabled: boolean;
  onToggle(id: string, checked: boolean): void;
  onSelectPage(checked: boolean): void;
  onDetails(id: string): void;
}

export function LibraryTable({
  items,
  selected,
  disabled,
  onToggle,
  onSelectPage,
  onDetails,
}: Props) {
  const { t } = useTranslation();
  const all = items.length > 0 && items.every((item) => selected.has(item.id));
  return (
    <div className="library-table-scroll">
      <Table density="compact" verticalAlign="top" aria-label={t('libraryTab')}>
        <TableHeader>
          <TableRow>
            <TableHeaderCell scope="col">
              <CheckboxInput
                label={t('librarySelectPage')}
                isLabelHidden
                isDisabled={disabled}
                value={all ? true : selected.size ? 'indeterminate' : false}
                onChange={onSelectPage}
              />
            </TableHeaderCell>
            <TableHeaderCell scope="col">{t('batchVideo')}</TableHeaderCell>
            <TableHeaderCell scope="col">{t('libraryStatus')}</TableHeaderCell>
            <TableHeaderCell scope="col">{t('libraryDuration')}</TableHeaderCell>
            <TableHeaderCell scope="col">{t('libraryRelated')}</TableHeaderCell>
            <TableHeaderCell scope="col">{t('libraryDetails')}</TableHeaderCell>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <CheckboxInput
                  label={t('librarySelect', { name: item.name })}
                  isLabelHidden
                  value={selected.has(item.id)}
                  isDisabled={disabled}
                  onChange={(checked) => onToggle(item.id, checked)}
                />
              </TableCell>
              <TableCell>
                <span className="library-file-name">{item.name}</span>
              </TableCell>
              <TableCell>{t(`libraryAvailability_${item.availability}`)}</TableCell>
              <TableCell>
                <span className="numeric">{(item.duration_ms / 1000).toFixed(2)} s</span>
              </TableCell>
              <TableCell>{item.links.length}</TableCell>
              <TableCell>
                <Button
                  label={t('libraryDetails')}
                  isDisabled={disabled}
                  onClick={() => onDetails(item.id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
