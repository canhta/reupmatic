# SCR-02 — Editor & Video Processing

> Package: 1.8 · Updated: 2026-09-15 · Language: English.
> Subtitle behavior in §10 is confirmed. Overall layout, remaining video/audio behavior, and `ED-P*`/`ED-Q*` details remain partly proposed/open.
> This is not a complete Editor implementation contract. No stack, model, or performance SLA is approved.

## 1. Authority and confirmed requirements

Navigation belongs to [screens.md](screens.md). Decisions are in [DECISIONS.md](../DECISIONS.md); scope is SC-03–SC-07, SC-13–SC-14 in [BUSINESS_SCOPE.md](../BUSINESS_SCOPE.md). `ED-R*` and `ED-SUB01–08` have confirmation; `ED-P*`, `ED-SUB-P01`, and `ED-Q*` retain their stated maturity. Wireframes do not approve dimensions or final copy.

| ID | Confirmed requirement | Evidence |
|---|---|---|
| ED-R01 | Open local/Library videos without Douyin or mandatory profile setup. | D-04/D-13; B §3.4 |
| ED-R02 | Trim, split, crop/aspect ratio, flip, basic color, preview, and export. | B §3.4; SC-03 |
| ED-R03 | Repeated edits show actual processing results without full-video rendering after every change. | D-14 |
| ED-R04 | Learn CapCut desktop/DaVinci interaction patterns without equivalent complexity. | D-15 |
| ED-R05 | Manual fixed-region removal and fully automatic text/watermark processing; no mandatory region review in automatic mode. | D-16 |
| ED-R06 | Standalone OCR without requiring removal or audio transcription. | D-17 |
| ED-R07 | Save/apply/import/export profiles as secondary actions; format undecided. | D-08/D-13 |
| ED-R08 | Batch and Automation are core; automated execution cannot require reopening Editor for each video. | D-03/D-16/D-18 |
| ED-R09 | Editable transcripts; data/configuration changes invalidate affected results. Paid/upload/public actions need permission. | B §3.6–3.8, §5; D-10 |
| ED-R10 | Full subtitle-content/timing workspace synchronized with timeline/preview. | D-19; §10 |
| ED-R11 | Display edits do not regenerate voice; protect manual edits; SRT and subtitle/video/both outputs. | D-20–D-21 |
| ED-R12 | OCR also feeds independent category/tag analysis, not only subtitle output. | D-22; §11 |

Do not confuse **automatic tool execution** with **Plus workflow Automation**. A tool's auto mode does not by itself imply a new paywall; exact entitlements remain Q-05. All Editor UI follows English/Vietnamese requirements in screens NAV-L10N.

## 2. ED-P01 — Layout and main flow · PROPOSED

Flow: **open video → adjust settings and preview as needed → run/export → inspect results**. OCR-only can end in text data without video rendering. Preview is an editing aid, not a compulsory batch/Automation approval step.

```text
Sidebar | Project name · save state                  [Undo/Redo] [Export] [More]
        |------------------------------------------------------------------------
        | Project assets / batch videos | Main preview       | Context settings
        |                               | Before / After     | Basic controls
        |                               | Play / sample range| Advanced section
        |------------------------------------------------------------------------
        | Timeline: video + audio / voiceover / subtitle tracks when present
        | Preview range; valid cached regions; regions requiring an update
        |------------------------------------------------------------------------
        | Job state                                      [Process batch] [Jobs]
```

Use one main preview. The asset list belongs to the current project/batch, not a duplicate of the entire Library. **Subtitle editing opens a wide workspace beside the preview (§10)** instead of squeezing editable text into the asset panel. Track counts, panel sizes, and multi-clip behavior remain ED-Q01.

Proposed tool groups: **Video · Audio · Subtitles · OCR/STT · Translation & voice · Text removal · Content analysis**. Groups are not pipeline order. Export is prominent; profiles are in a secondary menu. Enabled processing steps remain identifiable after switching groups. Simpler presentation cannot remove required capabilities.

| Group | Required coverage / remaining specification | Status |
|---|---|---|
| Video | Trim/split, crop/ratio, flip, color; joining/reordering and speed still need detailed behavior. | Baseline ED-R02; remaining ED-Q01. |
| Audio | Original audio, music/voiceover, volume, mute/replace, trim, and timing alignment. | Scope to specify, not an already implemented track engine. |
| Subtitles | Create/import, text/time table, find/replace, comparison, style, and export. | Confirmed behavior in §10. |
| OCR/STT | Extract frame text or spoken words; view/edit timed results with provenance. | In scope; source handling ED-P03/ED-Q03. |
| Content analysis | OCR/context → category/tag with independent results/evidence. | D-22; detailed behavior in content-analysis. |
| Translation & voice | Edit translation and TTS text, select languages/voices, listen, regenerate affected sections, align. | Independent display/TTS text confirmed; alignment policy open. |
| Text removal | Remove subtitles/watermarks manually or automatically with real sample preview. | ED-R05; detailed processing ED-P03. |

Batch intake and clip assembly must be distinguishable. Proposed behavior: a batch list contains separate outputs, while intentionally adding clips to one project timeline assembles one output. Do not silently join every imported video. Exact assembly behavior remains ED-Q01.

## 3. ED-P02 — Actual sample previews · PROPOSED

Example: on a five-minute video, preview **01:20–01:30** while adjusting. Ten seconds is illustrative, not an approved default or processing-time promise.

| Change | Proposed preview | Reusable results |
|---|---|---|
| Crop/flip/color/existing subtitle style | Update lightweight composition during adjustment; continuous playback when hardware permits; clearly label proxies. | Do not rerun OCR/translation/TTS for presentation-only changes. |
| AI removal/heavy effects | Render the selected sample with actual processing; loop playback and compare before/after. | Retain unrelated audio/text artifacts. |
| Spoken-text or voice change | Generate/listen to selected cue(s), also with video to assess timing. | Retain independent visual results; recompute affected alignment. |

1. Label preview quality. A lightweight proxy helps interaction but does not replace heavy computation. Final-quality sample checks use the intended model/settings, not a silently substituted model or omitted effect.
2. Separate the **sample-view range** from the **effect application range**. Viewing ten seconds must not accidentally limit the full export's effect.
3. Coalesce repeated adjustments to the latest preview request. A late old result cannot overwrite the current version. Queued work may be cancelled; accepted provider work may be non-cancellable and does not imply an automatic refund.
4. Retain old previews with an **Out of date** label. Outside cached regions, identify unavailable processed preview; do not play original footage as though the effect was applied.
5. Cache by relevant input, model/configuration version, and affected scope. Do not reuse low-quality preview artifacts as final-quality output without meeting the final requirements.
6. Processing may need wider context than the displayed range. Text/duration changes can affect later alignment; do not promise every edit invalidates exactly one cue. Full output still needs boundary/temporal checks.
7. Sliders and typing cannot silently spend credits. Paid previews require prior authorization/budget and visible estimates/data disclosure. A slow machine does not authorize cloud fallback.

Proposed state progression: no sample → queued/running → valid sample → settings changed/out of date. Errors retain edits. Missing local components use contextual setup under [settings.md](settings.md) ST-R03; resource issues may deep-link to the relevant advanced setting and return to the project. Do not force a Settings detour for every installation. Preview priority over batch, cache quota, and latency require measurements, not invented SLAs.

## 4. ED-P03 — OCR and removal · PROPOSED

| Intent | Operation | Output |
|---|---|---|
| Extract burned-in subtitles | Detect → recognize → merge repeated observations → assign time intervals. | Timed text for §10/SRT; TXT remains ED-Q03. |
| Extract scene text | Find text relevant to the purpose; retain location/time where available. | Structured text for extraction/analysis, not every text region treated as a subtitle. |
| Assign categories/tags | OCR → analyze → store labels, independently of removal/translation/rendering. | [content-analysis.md](content-analysis.md) results and routing inputs. |
| Automatic subtitle removal | Find subtitle regions → time-varying masks → remove/reconstruct. | Sample or processed video, without region approval. |
| Automatic watermark removal | Detect/track target → process over time. | Sample or processed video; do not assume OCR detects non-text logos. |
| Manual region removal | Draw fixed region(s) on preview; proposed optional time range. | Manual-mask configuration, not a required next step of auto mode. |

When extraction and removal are enabled, OCR consumes frames **before text is erased**. Reuse detection only when suitable; distinguish subtitles, scene text, and watermarks. OCR text is not itself a removal mask or an exact product identity.

Keep `OCR` and `STT` provenance distinct and do not silently merge conflicting content. OCR-only does not require audio. Optional inspection/editing does not become an automatic-processing gate.

Distinguish no target, technical error, and successful processing. Do not fabricate text, require manual regions to continue the whole workflow, or claim removal after skipping a required step. Low-confidence/no-target/retry policies remain ED-Q03/04. Product/affiliate correction is a separate business workflow, not abolished by auto-removal requirements.

Models, ONNX/ONNX Runtime, and OpenCV are technical research leads, not choices users must understand. Moving watermarks, complex backgrounds, and temporal consistency remain R-03/R-06; no benchmark is claimed.

## 5. ED-P04 — Batch, profiles, and Automation · PROPOSED

Edit one video, then use **Apply to batch / Process batch** to select additional videos and the reusable settings to apply. Do not require a profile name. Show whether changes affect this video or selected videos; editing one item must not silently change the entire batch.

Reusable settings include languages, voices, style, rules, and processing method. Per-video results include OCR/STT text, manual cue edits, detected masks, timestamps, and outputs. Automatic processing derives results per video; it must not copy the sample video's mask/text into every item. Fixed-region reuse across aspect ratios needs explicit coordinate semantics, not silent stretching.

| Secondary action | Meaning |
|---|---|
| Save/apply profile | Capture reusable settings; apply and continue editing without silently modifying the source profile. |
| Import/export profile file | Versioned validation; report missing voices/models/assets; importing does not execute jobs. XML/JSON/extension are undecided. |
| Use in Automation | Pass processing configuration or optionally select a profile; no Editor opening per run. Workflow update/version behavior is open. |

Profiles exclude cookies/tokens and cannot authorize charges or publishing. Proposed run snapshots prevent later profile edits from silently changing in-flight work; this is not an approved data contract.

Isolate item failures so independent work continues. Shared provider/source faults should block only affected work. Fully automatic must not mean endless retries or quietly incomplete exports. Retry counts and charging policy remain open.

## 6. ED-P05 — Save, run, and export · PROPOSED

Export chooses video, subtitle file, or both (§10), range, and destination. Subtitle-only does not require video rendering. Check missing/stale prerequisites, resources, permission, and estimated cost before full execution. Export follows configured quality and steps, not simply the lightweight preview.

Exports return to the Library; post preparation at SCR-03 is separate, never implicit publication. Proposed autosave and undo/redo preserve project edits; undo cannot reverse provider charges or published posts. Reference-first import, optional copy, relink, and separate deletion scope are confirmed in [sources-library.md](sources-library.md); follow its dependency rules rather than implementing another asset store. Autosave cadence, project count, cache retention, and recovery remain open. Do not overwrite the original by default.

## 7. Acceptance checks

`R` = confirmed requirement; `P` = proposed detail to test after approval. **No tests/benchmarks have been executed.**

| ID | Scenario / expected result | Type |
|---|---|---|
| ED-AC01 | Open own video without a profile/Douyin; editing is available. | R |
| ED-AC02 | Repeatedly edit a five-minute video; actual preview does not require repeated full-video renders. | R |
| ED-AC03 | Run OCR-only on a silent video without removal. | R |
| ED-AC04 | Batch automatic removal/extraction does not pause for per-video mask approval. | R |
| ED-AC05 | Manual/automatic modes are separate; automatic mode has no inherited manual gate. | R |
| ED-AC06 | Late stale preview cannot replace current configuration/results; label stale output correctly. | P |
| ED-AC07 | Style/cue edits reuse unaffected artifacts and invalidate relevant alignment. | P |
| ED-AC08 | Sample-view range does not unintentionally restrict full-export effects. | P |
| ED-AC09 | Profiles round-trip; unsupported versions/missing assets are explained; import triggers no hidden services/uploads/publishing. | R + P |
| ED-AC10 | Different ratios and moving text do not cause per-video detected masks/text to be copied across a batch. | P |
| ED-AC11 | No target, model error, and item failure are distinguished with honest completion states. | P |
| ED-AC12 | Paid preview cancel/timeout/slider changes create no unapproved repeated requests or assumed refunds. | P |
| ED-AC13 | Create/import/edit/add/delete/split/merge cues with undo/redo; typing does not call AI. | R: ED-SUB01–02 |
| ED-AC14 | Table/timeline selection and start/end/group-shift edits stay synchronized with preview. | R: ED-SUB01/03 |
| ED-AC15 | Find/replace on selected cues/whole track has preview/undo; comparison does not overwrite source text. | R: ED-SUB04 |
| ED-AC16 | Cue/group/track styling affects the selected scope, not content or TTS. | R: ED-SUB05 |
| ED-AC17 | Display edits do not generate speech; explicit Apply to voice text precedes authorized regeneration. | R: ED-SUB06 |
| ED-AC18 | Late/repeated OCR/translation cannot silently overwrite manual edits; deliberate replacement has a defined path. | R + P |
| ED-AC19 | SRT-only, burned-in video, and both produce their selected outputs; style/timing fidelity follows future contracts. | R + P |
| ED-AC20 | Automatic subtitles in batch/Automation do not require the Editor or cue-by-cue approval. | R: ED-SUB08 |
| ED-AC21 | OCR-to-category/tag works without creating subtitles/removing text; exceptions follow CA checks. | R capability; details P |
| ED-AC22 | English/Vietnamese UI switching preserves cue text, voice language, timing, manual edits, and jobs; both languages render correctly. | R: D-31; NAV-L10N checks |

## 8. Open decisions

| ID | Remaining decision | Direction / ownership |
|---|---|---|
| ED-Q01 | Video/audio tools, timeline/clip assembly/tracks, timing under trim/speed, and batch application scope. | Subtitle behavior is already §10. Specify remaining tools without silently excluding them. |
| ED-Q02 | Manual versus idle-triggered heavy preview, sample default, and quick/final-quality modes. | Proposed direct lightweight changes and explicit heavy samples; owner confirms UX, agent benchmarks hardware. |
| ED-Q03 | Combined OCR/STT behavior, scene-text/TXT outputs, no-text/low-confidence handling. | SRT is confirmed; preserve provenance and automatic operation. Algorithms/thresholds require evidence. |
| ED-Q04 | Retry/failure, batch override, profile/run versions, autosave/recovery, preview charges, depleted credits. | Agent proposes dependency-aware behavior; consequential cost/data/access policies need approval. |
| ED-Q05 | Subtitle split/merge defaults, timecodes, trim/speed mapping, invalid imports, deliberate replacement, style portability, shortcuts. | ED-SUB-P01 contains proposals. Do not ask again whether content editing, SRT, or independent voice text is required. |

## 9. UI references — inherited research, not new verification

The earlier package recorded a public-documentation review dated **2026-09-15**. This English translation preserves those leads; it does not claim a new source check, hands-on app audit, or usability benchmark. Do not copy proprietary UI assets.

| Reference | Research purpose |
|---|---|
| CapCut — How to Use CapCut; `https://www.capcut.com/resource/how-to-use-capcut` | Study import/timeline interaction and contextual editing instead of mandatory long wizards. |
| Blackmagic Design — DaVinci Resolve, Edit; `https://www.blackmagicdesign.com/products/davinciresolve/edit` | Study media/timeline/inspector organization and direct preview manipulation without reproducing the entire professional toolset. |

ED-P01 and ED-P02 are **our product proposals**, not claims that these reference products implement the exact same preview mechanisms. Verify current source/application behavior during R-08 work.

## 10. Subtitle editing · CONFIRMED within D-19–D-21

This is the authoritative subtitle behavior, supplementing ED-P01 and ED-R09–ED-R11. Sources: B §3.6–3.8; C-15–C-16. It does not settle video/audio tracks, models, alignment algorithms, pricing, or preview defaults.

### 10.1. ED-SUB01 — Workspace and selection

Selecting **Subtitles** opens a substantial editing area beside the preview; collapse assets to make room. Do not open a second application/editor. Show cue number, start, end, editable content, and optional source/translation columns. Keep the timeline for existing video/audio/voiceover/subtitle data below.

```text
[Video] [Audio] [Subtitles] [OCR/STT] [Translation & voice] [Text removal]
+--------------------------+--------------------------------------------------+
| PREVIEW                  | [From OCR/STT] [Import] [+ Cue]                  |
| Play / Before-After      | [Find/replace] [Show source] [Style]             |
|                          | #  Start       End         Content               |
|                          | 1  00:01.200   00:03.400   [Edit directly...]    |
|                          | 2  00:03.500   00:06.000   [Edit directly...]    |
+--------------------------+--------------------------------------------------+
| Timeline: Video / Audio / Voiceover / Subtitles                             |
+----------------------------------------------------------------------------+
```

Selecting a table cue selects its timeline interval and moves preview to that cue. Selecting a subtitle interval selects the corresponding row. Table and timeline edit the **same track**, not independent text copies. The wireframe is organizational, not final geometry. All controls/cue operations must work in both UI languages.

### 10.2. Confirmed operations

| ID | Operation / scope | Required behavior |
|---|---|---|
| ED-SUB02 | Cue content | Type/edit text, line breaks, add/delete/split/merge, undo/redo. Do not require OCR/STT or AI just to correct a word. |
| ED-SUB03 | Cue/group timing | Edit start/end, drag interval edges, shift selected cues together, and loop a cue for checking. Split/merge defaults and invalid data remain ED-Q05. |
| ED-SUB04 | Bulk text and comparison | Find/replace and advanced regex/rules; selected-cue or whole-track scope; preview and undo. Optional source/translation columns; clearly identify whether editing source, translation, voice text, or displayed text. |
| ED-SUB05 | Appearance | Font, size, color, outline, shadow, background/opacity, position, width, line breaks, spacing. Apply to cue/group/track with visible scope. Update subtitle composition without retranslation/TTS. |
| ED-SUB06 | Voice relationship | Display and spoken text are independent. Apply to voice text is explicit, followed by separately authorized generation. Mark affected alignment; do not silently truncate/stretch voice or charge during typing. |
| ED-SUB07 | Create/import/export | Manual, OCR/STT, or SRT input; subtitle-file output, burned-in video, or both. SRT-only needs no video render. Other formats/style preservation remain ED-Q05. |
| ED-SUB08 | Batch/Automation | Manual editing is optional, not a checkpoint. Auto runs to configured output. Reusable rules/styles are separate from per-video OCR/STT and manual content. |

Editing extracted text does not replace burned-in source pixels. Replacing visible source text requires OCR → optional editing → original-text removal → render new subtitles. Users may also extract/export text without removal or video rendering.

**Manual-edit protection:** completed OCR/translation or older jobs cannot silently overwrite user-edited text. Undo does not refund completed service work. Versioning/comparison/replacement mechanics are proposed below; they must not become review gates for every automatic item.

### 10.3. ED-SUB-P01 — Detailed implementation behavior · PROPOSED

| Situation | Proposed behavior, not yet a final contract |
|---|---|
| Text focus / shortcuts | While editing text, typing/deletion and input-method composition belong to that field, not clip shortcuts. Maintain one shared selection state. |
| Split/merge | Split at the caret with a valid time boundary; do not invent word alignment. Merge temporally adjacent cues in order; a display-only operation must not mutate original or voice text. |
| Invalid times / overlaps | Mark the affected row. Do not silently rewrite/truncate text. Block affected outputs with invalid intervals; warn on overlaps under the eventual policy. |
| Late AI result | Retain newly generated results separately from the user's current edits; replacing edits must be intentional. Late work cannot switch the selected track or trigger TTS. |
| Import / source replacement | Validate before replacing edited content. Define append/replace, timing, encoding, and error behavior before building the parser. No silent whole-track replacement. |
| Trim/join/speed | Table, preview, and export share time mapping. Subtitle/voice clipping or shifting policy must be resolved with ED-Q01, not guessed here. |

### 10.4. States and checks

Proposed states: no track with create/import/add actions; AI running in shared jobs; editable track; invalid time on a specific row; voice needs regeneration independently of corrected subtitles. Switching tools/language cannot discard text. Autosave/recovery details remain ED-P05/ED-Q04.

Use ED-AC13–20 and ED-AC22 plus preview/automatic-path checks. Confirmed subtitle behavior does not mean the entire Editor is implementation-ready. Earlier subtitle and analysis additions remain intact in this English revision.

## 11. OCR for content classification

**Confirmed — D-22/ED-R12:** provide OCR → analysis → category/tag assignment. [content-analysis.md](content-analysis.md) owns this behavior. A subtitle table or SRT export is not a substitute.

**Proposed:** Content analysis opens OCR evidence, categories/tags, status, and supporting timestamps for the current video. Users may inspect/correct labels without mandatory auto checkpoints. Store results with the relevant Library content/version for batch/Automation reuse, not only in the current project.

Keep §10 and remaining video/audio scope intact. OCR may feed both branches, but their purposes, results, and lifecycles are distinct. Reclassifying labels cannot overwrite subtitle edits. Bilingual labels/statuses follow NAV-L10N; manual taxonomy names remain user data.

**Execution-policy handoff:** [execution-policy.md](execution-policy.md) proposes shared credit/Plus gates, paid-preview accounting, interruption, and recovery. It does not make profiles mandatory, reduce subtitle/video/audio tools, charge while typing, or settle Free manual-batch limits. OP-P* behaviors require approval; valid cached/edited results remain governed by this Editor spec.


## 0.12 implementation note — not resolution of all ED-Q01 choices

The current source delivers bounded direct-Editor hard-cut composition: explicit
native append, source trim/speed, split/reorder/contiguous join, montage caption
mapping, sample/full rendering, undo/recovery and complete source reauthorization.
Implementation choices and limits are in `docs/development/local-composition.md`;
verification is in `research/integration-0.12/RESULTS.md`. Keep ED-Q01's broader
layer/transition/per-clip processing choices open. Current montage AI is unavailable,
and installed visual acceptance is separate from native rendering tests.


## Integration 0.13 — bounded text-layer and local STT implementation

The independent transcript/translated/spoken/displayed requirement now has a
current document, edit/history/persistence behavior and explicit preview/apply.
The cue editor and timeline target the selected layer; display rendering never
silently uses another layer. Language/provenance and stale-copy review preserve
manual corrections. Composition edits map each layer through existing source/time
commands without replacing its independent words.

`specs/local-speech.md` records LS-AC01–10 and the single-source recognition slice.
It does not approve all proposed ED defaults or close outstanding ED-Q decisions.
There is no automatic translation or synthesized/aligned voice merely because
these layer names exist. Actual-model language evidence, installed UI/IME/focus,
resource acceptance and remaining processing endpoints still require verification.
