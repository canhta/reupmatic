import { bundledFonts, bundledFontUrl, defaultFontFamily } from '../../../core/subtitles/fonts';

/**
 * The live renderer's font configuration. Every JASSUB instance (the monitor, template thumbnails)
 * must spread this so it pre-loads the same files libass burns and cannot drift from the export.
 */
export function jassubFontOptions() {
  const font = bundledFonts[0];
  return {
    fonts: [bundledFontUrl(font.regular.id), bundledFontUrl(font.bold.id)],
    defaultFont: defaultFontFamily,
  };
}
