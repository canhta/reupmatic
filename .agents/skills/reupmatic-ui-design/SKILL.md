---
name: reupmatic-ui-design
description: Design and review Reupmatic's high-end desktop UI. Use before changing React components, CSS, layouts, dialogs, empty/error states, localization, editor controls, or automation screens. Combines the owner's high-end visual reference with explicit desktop, accessibility, and performance adaptations.
---

# Reupmatic — Principal UI/UX Architect & Motion Choreographer

## 1. Authority and reading order

Read this skill before any UI task. Read the relevant `specs/` behavior and inspect existing components before changing them. The owner supplied **high-end-visual-design**, preserved byte-for-byte in [the original reference](references/original-high-end-visual-design.md). Its terminology and prescriptions are reference material, not verified price, usability, or performance claims.

[Desktop adaptation](references/desktop-adaptation.md) explicitly explains every material departure. Reupmatic is a bilingual desktop video workbench, not a marketing page. Confirmed product behavior, keyboard access, readable text, performance, and truthful states take precedence over decorative recipes. Do not silently attribute our additions to the reference.

The current 0.6 visual direction is **Astryx neutral dark + an Editorial Split workspace**: library-owned surfaces and controls, precise type, a nested native-media enclosure, clear tool groups, and a usable cue table. This supersedes the 0.5 graphite/mint palette under the owner's single-library requirement. This is a reversible implementation choice, not a new product requirement. Do not reroll a different theme for each screen.

## 2. The Absolute Zero directive — adapted anti-patterns

- No generic dashboard of equally weighted cards, random gradients, emoji as action icons, oversized hero headings, or fabricated activity/statistics.
- No unexplained icon-only actions, hover-only controls, color-only status, disabled controls without a reason, or polished buttons that do nothing.
- No loss of subtitle content/timing/split/merge/undo, waveform, timeline, batch controls, or workflow steps to simplify the visual layout.
- No arbitrary colors, radii, shadows or z-indexes: use [design tokens](../../../app/ui/design-tokens.css).
- No model download, upload, credit spending, publishing, or whole-video render on navigation, typing, theme/locale changes, or decorative interactions.
- No claim that code is visually validated without rendering and inspecting the actual application. A static check is not a screenshot review.

## 3. Typography, spatial rhythm, and icon discipline

The source prefers Geist / Plus Jakarta Sans and light-line iconography, and bans common generic font choices. Use the documented preferred font stack, but do not assume a commercial font is installed/licensed or download one silently. A system fallback remains available for readable offline EN/VI text; font procurement/embedding is a separate release gate. Never bundle font binaries in agent handoffs.

Use one UI family and tabular numerals for timecodes/counts. Keep the desktop working scale: body/controls 14px, metadata 12px, panel headings 14–16px, page title 24px. Never use the source's 10px eyebrow style for essential information. Use 4/8/12/16/24/32 spacing tokens, 36px controls, and resizable/wrapping workspaces. Avoid uppercase Vietnamese paragraphs and tracking that damages legibility.

Reuse an installed icon set; if introducing icons later, prefer the source's Phosphor Light/Remix Line direction after package review. Text labels are better than a bespoke SVG icon system. Use at most one visually primary action within each task area.

## 4. Component mastery

**Double-Bezel:** give major work surfaces an outer tray, a subtle separating edge and a slightly tighter inner radius. Apply it to the media stage and workflow workspace, not every table cell or input. Borders are intentional surface separators; do not hide focus/contrast to satisfy a literal ban on 1px lines.

**Island CTA:** reserve a soft pill or rounded primary CTA for the task's main action. Dense row controls stay compact. A trailing icon, when present, may have the source's nested treatment; do not insert fake arrows or extra buttons solely to reproduce it.

**Spatial rhythm:** maintain obvious hierarchy: navigation → work area header → task controls → content → status. Large content is allowed to scroll; controls and media keep useful space. Preserve the five areas and shared queue. Profiles remain secondary actions; Settings remains three groups. Data tables are appropriate for cues, files and jobs, not a failure of creativity.

## 5. Motion choreography and performance

Use named easing and duration tokens. Animate a deliberate panel entrance or a short button press, not every row or frame. Prefer transform/opacity; avoid `transition: all`, layout-size animations, permanent `will-change`, or blur/noise over the video, scrolling subtitle table, waveform, or job list. The source's universal 700–800ms cinematic reveal is **not** used on editing controls.

Respect `prefers-reduced-motion` by removing decorative movement. Focus, cancel, text input, seeking and progress must never wait for animation. Use immediate state changes where precision or reduced motion requires them. Do not animate the playback clock or smooth over stale/failed results.

## 6. Behavior and bilingual UX

Keep UI language independent from subtitle/voice language, taxonomy identity and schedules. Every new action, status, empty/error state and accessible label needs EN and VI strings. Keep paths, user text, category names and proper nouns intact. IME composition must not trigger editor shortcuts or submit forms.

Always include: empty state with one useful next action; loading with real progress when known; error with a recovery action; disabled/unavailable reason; success with the actual output. Preserve selections/edits on navigation and failed actions. Do not show "Plus connected", "watching", "AI removed" or "published" without that state being true.

## Astryx discovery gate

Before choosing a component, read [the task-to-component map](../../../docs/ui/astryx-component-map.md)
and [the observed catalogue](../../../docs/ui/astryx-inventory.json). Inspect the installed
CLI/API, relevant best practices and matching composition references. Record task,
states, alternatives and rationale. Appropriate reuse is mandatory; importing more
components is not a design goal. The owner's Astryx policy supersedes any visual
recipe that would require custom lookalike controls or conflicting control tokens.

## 7. Execution protocol

1. Identify the user's task, dominant working area, main action and required states from the spec.
2. Read the original reference and adaptation once; reuse existing tokens/components rather than adding another styling system.
3. Implement behavior and semantics together. Wire real actions or clearly mark unavailable capability. Keep dependency/setup failures isolated.
4. Apply the restrained visual direction and purposeful motion; do not change product behavior for visual effect.
5. Run [the review checklist](references/review-checklist.md). Record which checks ran and which await setup. No aesthetic score or "pixel-perfect" assertion without evidence.

Repository activation: root `AGENTS.md` explicitly points here. This is a project-local skill, not a global installation or a claim that every agent client auto-discovers this folder.
