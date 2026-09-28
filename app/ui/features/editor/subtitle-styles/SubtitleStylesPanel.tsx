import { MoreMenu } from '@astryxdesign/core/MoreMenu';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fitCoverBand } from '../../../../core/subtitles/cover-fit';
import { getTextLayer, textLayerNames } from '../../../../core/subtitles/layers/document';
import {
  applyCueStyle,
  defaultCoverBand,
  type SubtitleStyle,
} from '../../../../core/subtitles/style';
import { PanelRow, PanelRows, PanelSection, PanelSections } from '../../../design-system/Panel';
import { useEditor } from '../EditorContext';
import { DrawerActions } from '../ToolDrawer';
import { SubtitleStyleForm } from './SubtitleStyleForm';
import { SubtitleTemplates } from './SubtitleTemplates';

type Scope = 'global' | 'cue';
const NO_LAYER = 'none';

/** Text: how the shown caption layer looks, for every cue or the selected one. */
export function SubtitleStylesPanel() {
  const { t } = useTranslation();
  const editor = useEditor();
  const [scope, setScope] = useState<Scope>('global');
  const selected = editor.cues.find((cue) => cue.id === editor.selected);
  const disabled = editor.busy || editor.opening;
  const globalStyle = editor.processing?.subtitle_style;
  const effectiveScope: Scope = scope === 'cue' && selected ? 'cue' : 'global';
  const current = effectiveScope === 'cue' ? selected?.style : globalStyle;
  const origin = getTextLayer(editor.textSnapshot, 'displayed').origin;
  const regions = origin.kind === 'ocr' && origin.regions ? origin.regions : [];
  const media = editor.media;
  function fitCover(style: SubtitleStyle) {
    if (!media || !regions.length) return null;
    const fit = fitCoverBand(
      regions,
      editor.processing?.editing,
      { width: media.width, height: media.height },
      style.cover ?? defaultCoverBand(style),
    );
    if (!fit) return null;
    return {
      style: { ...style, cover: fit.band },
      others: fit.others.map((r) => Math.round(r.y_pct)),
    };
  }
  function apply(style: SubtitleStyle | undefined) {
    if (effectiveScope === 'cue' && selected) {
      editor.change(applyCueStyle(editor.cues, [selected.id], style));
      return;
    }
    const next = { ...(editor.processing ?? {}) };
    if (style) next.subtitle_style = style;
    else delete next.subtitle_style;
    editor.changeProcessing(Object.keys(next).length > 0 ? next : undefined);
  }
  return (
    <>
      <DrawerActions>
        <MoreMenu
          label={t('moreActions')}
          size="sm"
          items={[
            {
              label: t('styleResetAll'),
              isDisabled: disabled || !current,
              onClick: () => apply(undefined),
            },
          ]}
        />
      </DrawerActions>
      <PanelSections>
        <PanelRows>
          {/* The shown layer is the one burned into the export, so it is what this panel styles. */}
          <Selector
            label={t('styleBurnIn')}
            value={editor.visibleLayer ?? NO_LAYER}
            isDisabled={disabled}
            options={[
              { value: NO_LAYER, label: t('styleNoLayer') },
              ...textLayerNames.map((value) => ({ value, label: t(`textLayer_${value}`) })),
            ]}
            onChange={(value) => {
              const layer = textLayerNames.find((name) => name === value);
              if (layer) editor.changeLayerVisibility(layer, true);
              else if (editor.visibleLayer)
                editor.changeLayerVisibility(editor.visibleLayer, false);
            }}
          />
          <PanelRow label={t('styleApplyTo')}>
            <SegmentedControl
              label={t('styleApplyTo')}
              value={effectiveScope}
              size="sm"
              layout="fill"
              isDisabled={disabled}
              onChange={(next) => setScope(next === 'cue' ? 'cue' : 'global')}
            >
              <SegmentedControlItem value="global" label={t('styleApplyGlobal')} />
              <SegmentedControlItem value="cue" label={t('styleApplyCue')} isDisabled={!selected} />
            </SegmentedControl>
          </PanelRow>
        </PanelRows>
        <PanelSection title={t('styleTemplate')}>
          <SubtitleTemplates value={current} disabled={disabled} onChange={apply} />
        </PanelSection>
        <SubtitleStyleForm
          key={effectiveScope === 'cue' ? selected?.id : 'global'}
          value={current}
          inherited={effectiveScope === 'cue' ? globalStyle : undefined}
          disabled={disabled}
          onChange={apply}
          onFitCover={regions.length ? fitCover : undefined}
        />
      </PanelSections>
    </>
  );
}
