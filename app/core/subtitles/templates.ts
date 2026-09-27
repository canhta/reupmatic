import type { SubtitleAnimation, SubtitleStyle } from './style.js';

/** A named starting combination the user picks, then adjusts. Data, not a code path. */
export interface SubtitleTemplate {
  id: string;
  animation: SubtitleAnimation;
  uppercase: boolean;
  bold: boolean;
  outline_pct: number;
  accent_color: string;
}

const NO_ANIMATION = {
  in: { preset: 'none', duration_ms: 200 },
  out: { preset: 'none', duration_ms: 200 },
  emphasis: { preset: 'none' },
} as const;

export const subtitleTemplates: readonly SubtitleTemplate[] = Object.freeze([
  {
    id: 'clean-fade',
    animation: {
      in: { preset: 'fade', duration_ms: 250 },
      out: { preset: 'fade', duration_ms: 250 },
      emphasis: { preset: 'none' },
    },
    uppercase: false,
    bold: false,
    outline_pct: 0.2,
    accent_color: '#FFD400',
  },
  {
    id: 'pop-words',
    animation: {
      ...NO_ANIMATION,
      emphasis: { preset: 'pop' },
    },
    uppercase: false,
    bold: false,
    outline_pct: 0.2,
    accent_color: '#FFD400',
  },
  {
    id: 'karaoke',
    animation: {
      ...NO_ANIMATION,
      emphasis: { preset: 'karaoke' },
    },
    uppercase: false,
    bold: false,
    outline_pct: 0.2,
    accent_color: '#FFD400',
  },
  {
    id: 'bold-highlight',
    animation: {
      in: { preset: 'pop', duration_ms: 200 },
      out: { preset: 'none', duration_ms: 200 },
      emphasis: { preset: 'color' },
    },
    uppercase: true,
    bold: true,
    outline_pct: 0.4,
    accent_color: '#FFD400',
  },
]);

export function applySubtitleTemplate(
  style: SubtitleStyle,
  template: SubtitleTemplate,
): SubtitleStyle {
  return {
    ...style,
    animation: structuredClone(template.animation),
    uppercase: template.uppercase,
    bold: template.bold,
    outline_pct: template.outline_pct,
    accent_color: template.accent_color,
  };
}

/** The template whose fields the style currently matches, or undefined when it was adjusted. */
export function matchingSubtitleTemplate(style: SubtitleStyle): SubtitleTemplate | undefined {
  return subtitleTemplates.find(
    (template) =>
      JSON.stringify(template.animation) === JSON.stringify(style.animation) &&
      template.uppercase === style.uppercase &&
      template.bold === style.bold &&
      template.outline_pct === style.outline_pct &&
      template.accent_color.toUpperCase() === style.accent_color.toUpperCase(),
  );
}
