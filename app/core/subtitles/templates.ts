import type { SubtitleAnimation, SubtitleStyle } from './style.js';

/** A named starting combination the user picks, then adjusts. Data, not a code path. */
export interface SubtitleTemplate {
  id: string;
  animation: SubtitleAnimation;
  uppercase: boolean;
  bold: boolean;
  outline_pct: number;
  shadow_pct: number;
  accent_color: string;
}

/** Bold-highlight outline: ~9 % of the default 4.5 % font size (style outline is % of height). */
export const BOLD_OUTLINE_PCT = 0.4;
/** Bold-highlight keeps a slight shadow for the reference "Hormozi" look. */
export const BOLD_SHADOW_PCT = 0.06;

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
    shadow_pct: 0.1,
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
    shadow_pct: 0.1,
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
    shadow_pct: 0.1,
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
    outline_pct: BOLD_OUTLINE_PCT,
    shadow_pct: BOLD_SHADOW_PCT,
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
    shadow_pct: template.shadow_pct,
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
      template.shadow_pct === style.shadow_pct &&
      template.accent_color.toUpperCase() === style.accent_color.toUpperCase(),
  );
}
