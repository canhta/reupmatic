import { Button } from '@astryxdesign/core/Button';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { useTranslation } from 'react-i18next';
import {
  CONTENT_DURATION_PRESETS,
  CONTENT_RECENCY_PRESETS,
  CONTENT_RESOLUTION_PRESETS,
  CONTENT_SIZE_PRESETS,
  type ContentFilterSelection,
  hasContentFilters,
  hasPublishedScopedFilter,
} from '../../../core/library/content-filters';
import type { Label } from '../../../core/taxonomy/taxonomy-contracts';

type MultiKey = 'origins' | 'media_kinds' | 'availability' | 'linked' | 'label_ids';
type SingleKey = 'duration' | 'resolution' | 'size' | 'added' | 'published';

interface Props {
  filters: ContentFilterSelection;
  labels: Label[];
  disabled: boolean;
  onChange(next: ContentFilterSelection): void;
  onClear(): void;
}

/**
 * The Library's attribute facets. Facets are a top filter bar rather than a second left rail:
 * the IA study found no majority for side surface vs top bar (4 vs 3), the bar costs no list
 * width at 1050px, and origin still reads as a first-class narrowing. A closed selector shows
 * the field name and an open one shows the clause — the same progressive pattern the Astryx
 * table-filter template uses, so there is no separate token bar to keep in sync.
 *
 * The facet list is data, not ten hand-written blocks: every option label is `prefix + value`, so
 * adding a preset is one list edit in `content-filters.ts` plus one locale pair. A facet a row
 * lacks is never presented as zero — the store keeps rows whose value is absent, and the
 * publish-date facet carries an explicit scope note because only connector items can satisfy it.
 */
export function LibraryFilters({ filters, labels, disabled, onChange, onClear }: Props) {
  const { t } = useTranslation();
  const labelOptions = labels
    .filter((label) => !label.archived)
    .map((label) => ({ value: label.id, label: label.name }));
  const options = (prefix: string, values: readonly string[]) =>
    values.map((value) => ({ value, label: t(`${prefix}${value}`) }));

  const multiFacets: {
    key: MultiKey;
    label: string;
    options: { value: string; label: string }[];
    hasSearch?: boolean;
    isDisabled?: boolean;
    disabledMessage?: string;
    emptyText?: string;
  }[] = [
    {
      key: 'origins',
      label: t('libraryFilterOrigin'),
      options: options('libraryFilterOrigin_', ['local', 'douyin']),
    },
    {
      key: 'media_kinds',
      label: t('libraryFilterMediaType'),
      options: options('libraryFilterMedia_', ['video', 'audio', 'subtitle', 'image', 'slides']),
    },
    {
      key: 'availability',
      label: t('libraryFilterAvailability'),
      options: options('libraryAvailability_', ['available', 'missing', 'changed', 'unchecked']),
    },
    {
      key: 'linked',
      label: t('libraryFilterLinked'),
      options: options('libraryFilterLinked_', ['project', 'subtitle', 'export']),
    },
    {
      key: 'label_ids',
      label: t('libraryFilterLabels'),
      options: labelOptions,
      hasSearch: true,
      isDisabled: labelOptions.length === 0,
      disabledMessage: t('libraryFilterNoLabels'),
      emptyText: t('libraryFilterNoLabels'),
    },
  ];

  const singleFacets: {
    key: SingleKey;
    label: string;
    presets: readonly string[];
    prefix: string;
  }[] = [
    {
      key: 'duration',
      label: t('libraryFilterDuration'),
      presets: CONTENT_DURATION_PRESETS,
      prefix: 'libraryFilterDuration_',
    },
    {
      key: 'resolution',
      label: t('libraryFilterResolution'),
      presets: CONTENT_RESOLUTION_PRESETS,
      prefix: 'libraryFilterResolution_',
    },
    {
      key: 'size',
      label: t('libraryFilterSize'),
      presets: CONTENT_SIZE_PRESETS,
      prefix: 'libraryFilterSize_',
    },
    {
      key: 'added',
      label: t('libraryFilterAdded'),
      presets: CONTENT_RECENCY_PRESETS,
      prefix: 'libraryFilterDate_',
    },
    {
      key: 'published',
      label: t('libraryFilterPublished'),
      presets: CONTENT_RECENCY_PRESETS,
      prefix: 'libraryFilterDate_',
    },
  ];

  const setMulti = (key: MultiKey, value: string[]) =>
    onChange({ ...filters, [key]: value } as ContentFilterSelection);
  const setSingle = (key: SingleKey, value: string | null) =>
    onChange({ ...filters, [key]: value ?? '' } as ContentFilterSelection);

  return (
    <section className="library-filters" aria-label={t('libraryFiltersLabel')}>
      {multiFacets.map((facet) => (
        <MultiSelector
          key={facet.key}
          label={facet.label}
          isLabelHidden
          variant="ghost"
          size="sm"
          hasClear
          hasSearch={facet.hasSearch}
          placeholder={facet.label}
          options={facet.options}
          value={filters[facet.key]}
          isDisabled={disabled || facet.isDisabled}
          disabledMessage={facet.disabledMessage}
          emptyText={facet.emptyText}
          searchPlaceholder={t('catalogSearch')}
          onChange={(value) => setMulti(facet.key, value)}
        />
      ))}
      {singleFacets.map((facet) => (
        <Selector
          key={facet.key}
          label={facet.label}
          isLabelHidden
          variant="ghost"
          size="sm"
          hasClear
          placeholder={facet.label}
          options={options(facet.prefix, facet.presets)}
          value={filters[facet.key] || null}
          isDisabled={disabled}
          onChange={(value) => setSingle(facet.key, value)}
        />
      ))}
      {hasContentFilters(filters) && (
        <Button
          className="library-filter-clear"
          variant="ghost"
          size="sm"
          label={t('libraryFilterClearAll')}
          isDisabled={disabled}
          onClick={onClear}
        />
      )}
      {hasPublishedScopedFilter(filters) && (
        <Text as="p" type="supporting" role="note" className="library-filter-scope">
          {t('libraryFilterScopePublished')}
        </Text>
      )}
    </section>
  );
}
