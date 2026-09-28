import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { useTranslation } from 'react-i18next';
import { textLayerNames } from '../../../../core/subtitles/layers/document';
import { CommandFooter, PanelRows } from '../../../design-system/Panel';
import { useEditor } from '../EditorContext';
import { DrawerFooter } from '../ToolDrawer';

/** Captions › Create › SRT: a subtitle file imports into the chosen layer. */
export function SrtCreate({ isActive }: { isActive: boolean }) {
  const { t } = useTranslation();
  const editor = useEditor();
  if (!isActive) return null;
  const disabled = editor.busy || editor.savingProject || editor.opening;
  return (
    <>
      <PanelRows>
        <Selector
          label={t('textEditingLayer')}
          value={editor.activeTextLayer}
          isDisabled={disabled || !editor.media}
          options={textLayerNames.map((value) => ({ value, label: t(`textLayer_${value}`) }))}
          onChange={(value) => {
            const layer = textLayerNames.find((name) => name === value);
            if (layer) editor.selectTextLayer(layer);
          }}
        />
      </PanelRows>
      <DrawerFooter>
        <CommandFooter>
          <Button
            label={t('captionImport')}
            variant="primary"
            isDisabled={disabled || !editor.media}
            onClick={() => void editor.importCaptions().catch(() => undefined)}
          />
        </CommandFooter>
      </DrawerFooter>
    </>
  );
}
