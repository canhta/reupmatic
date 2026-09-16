# Source-to-product adaptation

Basis: owner attachment `Pasted markdown.md`, 159 lines, received 2026-09-15. The original escaped Markdown is retained unchanged next to this file. This mapping distinguishes source prescriptions from Reupmatic design choices; it does not silently rewrite the source.

| Original section / term | What the source says | Reupmatic application / deliberate exception |
|---|---|---|
| 1: Persona and objective | Vanguard_UI_Architect; agency-level, haptic, cinematic quality. | Treat this as visual intent, not proof of monetary value or usability. Function and information hierarchy are acceptance requirements. |
| 1, 3: Variance Mandate / Creative Variance Engine | Never repeat a layout; select a vibe and layout archetype each time. | Keep one coherent app identity. Vary task composition only when the task requires it; do not randomly change a working editor. |
| 2: Absolute Zero fonts/icons | Ban Inter/Roboto/Arial/Open Sans/Helvetica and thick default icons; assume premium fonts available. | Prefer the named Geist/Plus Jakarta Sans direction and light-line icons. Do not assume availability/licenses. Offline system fallback and text labels are explicit exceptions. No new font/icon dependency was installed in this pass. |
| 2: Borders, shadows, layouts | No generic gray borders, harsh shadows, glued nav or symmetrical template grids. | Use layered graphite surfaces, subtle separator tokens and one task-oriented workspace. Persistent desktop sidebar/toolbars and structured data tables remain appropriate. |
| 3: Ethereal Glass / Editorial Split | Dark surfaces, glass/orbs; editorial asymmetric split with large type. | Restrained dark enclosure + asymmetric media/cue workspace; no orb behind media, heavy blur or giant title that displaces editing. |
| 3: Mobile Override | Stack below 768px, generous spacing, min-h-[100dvh]. | Desktop resizing/text scaling is required; mobile app is not new scope. Allow narrow-window stacking and use minimum dynamic height, not clipped fixed-height pages. |
| 4: Double-Bezel | Outer shell/inner core with concentric radii on all major cards. | Preserve on major work surfaces. Do not recursively wrap every cue, input or status in another large card. |
| 4: Island CTA / Button-in-Button | Large pills, nested trailing arrow. | A restrained primary CTA, compact operational actions. Nested icon treatment only when a real icon/action exists. |
| 4: Macro-whitespace / Eyebrow | py-24 to py-40 and 10px uppercase eyebrow. | Desktop spacing uses 4–32px tokens; essential text stays readable. No 96px panel padding or microscopic key labels. |
| 5: Fluid Island / magnetic hover / scroll reveals | Floating nav, large overlay, staggered/800ms entry, custom motion. | Desktop sidebar stays discoverable; optional 120–180ms transitions. No reveal delay on rows, cancellation or timeline. Reduced-motion and precise interaction are product additions. |
| 6: Performance guardrails | Transform/opacity; avoid scrolling blur; disciplined layers. | Adopt the intention. No global texture overlay, no decorative scroll listener, no perpetual GPU layer. Scrolling/waveform/timeline event handlers required for functionality are not universally forbidden. |
| 7–8: Execution/checklist | Choose archetype, scaffold, nested architecture, choreography, evaluate. | Preserve that review order, but check task completion, EN/VI, keyboard/IME, empty/error/busy states and evidence before claiming polish. |

The source itself combines large-area glass with later restrictions on blur, and demands both systemic z-indexes and an example fixed z-index 50. We do not present these as reconciled source rules: the app deliberately follows the conservative performance/layering interpretation.

## Current token choices (project-specific, not quoted from the source)

Graphite workspace, mint accent; restrained nested panel surfaces; 14px body, 24px page heading; 36px controls; 8/12/16px inner/outer radii; explicit focus and success/warning/error colors. CSS is the executable source of truth. These choices can evolve through inspected UI changes, not random per-screen restyling.


## 0.6 owner-directed Astryx update

The single-library requirement supersedes the 0.5 custom graphite/mint palette.
Use Astryx neutral dark tokens and the library font stack without bundling or
downloading fonts. Keep the useful native-media enclosure and editorial split;
Astryx owns controls, focus, tables, dialog semantics and shared typography.
This is a documented adaptation; the original owner attachment remains unchanged.
