import type { SaveWorkflow, Workflow } from '../core/automation/workflow-types';
import type { BatchSelection, BatchSnapshot, BatchSubmit } from '../core/batch/batch-types';
import type { CatalogSnapshot } from '../core/catalog/catalog-snapshot';
import type { MutationIdentity, Page } from '../core/catalog/catalog-types';
import type {
  AffiliateLink,
  Channel,
  CreatePost,
  EditPost,
  ExportChoice,
  Post,
  PostQuery,
  SaveAffiliate,
  SaveChannel,
} from '../core/distribution/distribution-types';
import type { Composition, CompositionClip } from '../core/editing/composition/document';
import type { AudioSource, Soundtrack } from '../core/editing/soundtrack';
import type { FolderCreate, FolderSnapshot } from '../core/folders/folder-types';
import type {
  LibraryAssetPage,
  LibraryAssetPreview,
  LibraryAssetQuery,
  LibraryAvailability,
  LibraryDependencies,
  LibraryImportOptions,
  LibraryImportProgress,
  LibraryImportResult,
  LibraryItem,
  LibraryLink,
  LibraryLinkKind,
  LibraryPage,
  LibraryQuery,
} from '../core/library/library-types';
import type { PublicVideo } from '../core/media/media-types';
import type {
  ProcessingProfile,
  ProfileDocument,
  SaveProfile,
} from '../core/profiles/profile-types';
import type { EditorSnapshot } from '../core/projects/project';
import type {
  RecoveryIdentity,
  RecoveryOpened,
  RecoverySave,
  RecoverySummary,
} from '../core/projects/recovery/recovery-types';
import type { SettingsSnapshot } from '../core/settings/settings-types';
import type { SpeechEvent, SpeechInput, SpeechStatus } from '../core/speech/recognition';
import type {
  SynthesisEvent,
  SynthesisInput,
  SynthesisStatus,
} from '../core/speech/synthesis/contracts';
import type {
  TranslationEvent,
  TranslationInput,
  TranslationStatus,
} from '../core/speech/translation/contracts';
import type { Cue } from '../core/subtitles/cues';
import type { ContentLabels, Label, SaveLabel } from '../core/taxonomy/taxonomy-types';
import type { ModelStatus, VisionInput, VisionResult } from '../core/vision/vision';
import type { Reply } from './bridge/client';
import type { Capabilities } from './features/editor/types';

type SaveResult = { saved: boolean; library_linked?: boolean };

type VisionJobEvent = { id: string; revision: number } & (
  | { event: 'progress'; data: { phase: string; fraction: number | null } }
  | { event: 'result'; data: VisionResult }
  | { event: 'error'; data: { code: string } }
);

// The render worker's progress/result payload is a raw, loosely-typed envelope
// (see core/worker/worker-client.ts Envelope); callers narrow individual fields.
type RenderJobEvent = { id: string; revision: number } & (
  | { event: 'progress'; data: Record<string, unknown> }
  | { event: 'result'; data: { artifact_id: string; url: string } & Record<string, unknown> }
  | { event: 'error'; data: { code: string } }
);

declare global {
  interface Window {
    reupmatic: {
      recoveryList(): Promise<Reply<RecoverySummary[]>>;
      recoverySave(input: RecoverySave): Promise<Reply<{ revision: number; updated_at: number }>>;
      recoveryOpen(input: RecoveryIdentity): Promise<Reply<RecoveryOpened | null>>;
      recoveryDiscard(input: RecoveryIdentity): Promise<Reply<{ removed: boolean }>>;
      onRecoveryFlush(cb: (input: { request_id: string }) => void): () => void;
      recoveryFlushResult(id: string, saved: boolean): Promise<Reply<{ accepted: boolean }>>;
      catalogSnapshot(): Promise<Reply<CatalogSnapshot>>;
      onCatalogChanged(cb: () => void): () => void;
      catalogSaveLabel(input: SaveLabel): Promise<Reply<Label>>;
      catalogContentLabels(
        input: MutationIdentity & { label_ids: string[] },
      ): Promise<Reply<ContentLabels>>;
      channelSave(input: SaveChannel): Promise<Reply<Channel>>;
      affiliateSave(input: SaveAffiliate): Promise<Reply<AffiliateLink>>;
      postList(input: PostQuery): Promise<Reply<Page<Post>>>;
      postExportChoices(): Promise<Reply<ExportChoice[]>>;
      postCreate(input: CreatePost): Promise<Reply<Post>>;
      postEdit(input: EditPost): Promise<Reply<Post>>;
      postReveal(id: string): Promise<Reply<{ revealed: boolean }>>;
      profileSave(input: SaveProfile): Promise<Reply<ProcessingProfile>>;
      profileRead(): Promise<Reply<ProfileDocument | null>>;
      profileExport(id: string): Promise<Reply<{ name: string } | null>>;
      workflowPickOutput(): Promise<Reply<{ output_id: string; name: string } | null>>;
      workflowSave(input: SaveWorkflow): Promise<Reply<Workflow>>;
      workflowRun(input: {
        workflow_id: string;
        expected_revision: number;
        request_id: string;
      }): Promise<Reply<{ id: string }>>;
      libraryAssets(input: LibraryAssetQuery): Promise<Reply<LibraryAssetPage>>;
      libraryAssetAttach(input: {
        item_id: string;
        kind: LibraryLinkKind;
      }): Promise<Reply<LibraryLink | null>>;
      libraryAssetCheck(input: {
        item_id: string;
        link_id: string;
      }): Promise<Reply<{ availability: LibraryAvailability }>>;
      libraryAssetPreview(input: {
        item_id: string;
        link_id: string;
      }): Promise<Reply<LibraryAssetPreview>>;
      libraryList(query: LibraryQuery): Promise<Reply<LibraryPage>>;
      libraryImport(options: LibraryImportOptions): Promise<Reply<LibraryImportResult | null>>;
      libraryCancelImport(): Promise<Reply<{ requested: boolean }>>;
      libraryOpen(id: string): Promise<Reply<PublicVideo>>;
      libraryOpenProject(
        itemId: string,
        linkId: string,
      ): Promise<Reply<{ media: PublicVideo; snapshot: EditorSnapshot } | null>>;
      libraryRelink(id: string): Promise<Reply<LibraryItem | null>>;
      libraryDependencies(id: string): Promise<Reply<LibraryDependencies>>;
      libraryForget(id: string): Promise<Reply<{ removed: boolean }>>;
      libraryReveal(itemId: string, linkId?: string): Promise<Reply<{ revealed: boolean }>>;
      onLibraryChanged(cb: () => void): () => void;
      onLibraryImport(cb: (progress: LibraryImportProgress) => void): () => void;
      batchFromLibrary(ids: string[]): Promise<Reply<BatchSelection>>;
      settingsSnapshot(): Promise<Reply<SettingsSnapshot>>;
      settingsPickOutput(): Promise<Reply<SettingsSnapshot | null>>;
      settingsClearOutput(): Promise<Reply<SettingsSnapshot>>;
      settingsPickModels(): Promise<Reply<SettingsSnapshot | null>>;
      settingsCancelModels(): Promise<Reply<{ requested: boolean }>>;
      onModelsChanged(cb: () => void): () => void;
      synthesisStatus(): Promise<Reply<SynthesisStatus>>;
      synthesisStart(
        input: SynthesisInput,
      ): Promise<Reply<{ request_id: string; revision: number }>>;
      synthesisCancel(id: string): Promise<Reply<{ requested: boolean }>>;
      synthesisConfigure(): Promise<Reply<SynthesisStatus | null>>;
      synthesisCancelSetup(): Promise<Reply<{ requested: boolean }>>;
      synthesisPreview(id: string): Promise<Reply<{ url: string }>>;
      synthesisChooseExport(
        id: string,
        kind: 'wav' | 'receipt',
      ): Promise<Reply<{ choice_id: string; name: string } | null>>;
      synthesisSave(choiceId: string, artifactId: string): Promise<Reply<{ name: string }>>;
      synthesisCancelExport(): Promise<Reply<{ requested: boolean }>>;
      onSynthesisJob(cb: (message: SynthesisEvent) => void): () => void;
      onSynthesisModelsChanged(cb: () => void): () => void;
      translationStatus(): Promise<Reply<TranslationStatus>>;
      translationStart(
        input: TranslationInput,
      ): Promise<Reply<{ request_id: string; revision: number }>>;
      translationCancel(id: string): Promise<Reply<{ requested: boolean }>>;
      translationConfigure(): Promise<Reply<TranslationStatus | null>>;
      translationCancelSetup(): Promise<Reply<{ requested: boolean }>>;
      onTranslationJob(cb: (message: TranslationEvent) => void): () => void;
      onTranslationModelsChanged(cb: () => void): () => void;
      speechStatus(): Promise<Reply<SpeechStatus>>;
      speechStart(input: SpeechInput): Promise<Reply<{ request_id: string; revision: number }>>;
      speechCancel(id: string): Promise<Reply<{ requested: boolean }>>;
      speechConfigure(): Promise<Reply<SpeechStatus | null>>;
      speechCancelSetup(): Promise<Reply<{ requested: boolean }>>;
      onSpeechJob(cb: (message: SpeechEvent) => void): () => void;
      onSpeechModelsChanged(cb: () => void): () => void;
      visionStatus(): Promise<Reply<ModelStatus>>;
      visionStart(input: VisionInput): Promise<Reply<{ request_id: string; revision: number }>>;
      visionCancel(id: string): Promise<Reply<{ requested: boolean }>>;
      onVisionJob(cb: (message: VisionJobEvent) => void): () => void;
      compositionStart(assetId: string): Promise<Reply<Composition>>;
      compositionPick(): Promise<Reply<CompositionClip[] | null>>;
      compositionPreview(
        input: Composition,
      ): Promise<Reply<{ clips: { id: string; url: string }[] }>>;
      audioPick(): Promise<Reply<AudioSource | null>>;
      audioPreview(input: Soundtrack): Promise<Reply<{ url: string }>>;
      hello(): Promise<Reply<Capabilities>>;
      open(): Promise<Reply<PublicVideo | null>>;
      importSubtitles(): Promise<Reply<{ cues: Cue[] } | null>>;
      ass(input: unknown): Promise<Reply<{ ass_text: string }>>;
      peaks(input: unknown): Promise<Reply<{ peaks: number[]; duration_ms: number }>>;
      render(input: unknown): Promise<Reply<{ request_id: string; revision: number }>>;
      cancel(id: string): Promise<Reply<{ requested: boolean }>>;
      saveSubtitles(input: unknown): Promise<Reply<SaveResult | null>>;
      saveVideo(id: string): Promise<Reply<SaveResult | null>>;
      openProject(): Promise<Reply<{ media: PublicVideo; snapshot: EditorSnapshot } | null>>;
      saveProject(input: unknown): Promise<Reply<SaveResult | null>>;
      batchSnapshot(): Promise<Reply<BatchSnapshot>>;
      batchPickVideos(): Promise<Reply<BatchSelection | null>>;
      batchPickSubtitle(): Promise<Reply<{ subtitle_id: string; subtitle_name: string } | null>>;
      batchPickDirectory(): Promise<Reply<{ output_id: string; name: string } | null>>;
      batchEnqueue(input: BatchSubmit): Promise<Reply<BatchSnapshot>>;
      batchPause(): Promise<Reply<BatchSnapshot>>;
      batchResume(): Promise<Reply<BatchSnapshot>>;
      batchCancel(id: string): Promise<Reply<BatchSnapshot>>;
      batchRetry(id: string): Promise<Reply<BatchSnapshot>>;
      batchReveal(id: string): Promise<Reply<{ revealed: boolean }>>;
      onBatch(cb: (snapshot: BatchSnapshot) => void): () => void;
      folderSnapshot(): Promise<Reply<FolderSnapshot>>;
      folderPickSource(): Promise<Reply<{ directory_id: string; name: string } | null>>;
      folderPickOutput(): Promise<Reply<{ directory_id: string; name: string } | null>>;
      folderCreate(input: FolderCreate): Promise<Reply<FolderSnapshot>>;
      folderStart(id: string): Promise<Reply<FolderSnapshot>>;
      folderPause(id: string): Promise<Reply<FolderSnapshot>>;
      onFolders(cb: (snapshot: FolderSnapshot) => void): () => void;
      dirty(dirty: boolean, language: string): Promise<Reply<null>>;
      onJob(cb: (message: RenderJobEvent) => void): () => void;
    };
  }
}
