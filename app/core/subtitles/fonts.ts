/**
 * The one bundled font set. Live (JASSUB) and export (libass) must load these exact files, so a
 * subtitle looks the same on every machine. Adding a family means adding its files and licence,
 * never a second lookup path.
 */
export interface BundledFontFile {
  /** Stable id the host serves read-only through `media://local/<id>`. */
  id: string;
  /** File name inside the bundled fonts directory. */
  file: string;
}

export interface BundledFont {
  family: string;
  regular: BundledFontFile;
  bold: BundledFontFile;
}

export const bundledFonts: readonly BundledFont[] = [
  {
    family: 'Be Vietnam Pro',
    regular: { id: 'font-be-vietnam-pro-regular', file: 'BeVietnamPro-Regular.ttf' },
    bold: { id: 'font-be-vietnam-pro-bold', file: 'BeVietnamPro-Bold.ttf' },
  },
];

/** The font family every new style uses. */
export const defaultFontFamily = bundledFonts[0].family;

/** Families the Style tool may offer; anything else is rejected by validation. */
export const fontFamilies: readonly string[] = bundledFonts.map((font) => font.family);

export function isBundledFontFamily(value: string): boolean {
  return fontFamilies.includes(value);
}

/** The renderer URL for a bundled font file, served through the existing media protocol. */
export function bundledFontUrl(id: string): string {
  return `media://local/${id}`;
}

/** Every bundled file, flattened for host registration and packaging checks. */
export function bundledFontFiles(): BundledFontFile[] {
  return bundledFonts.flatMap((font) => [font.regular, font.bold]);
}
