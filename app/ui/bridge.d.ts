import type { SynthesisInput, SynthesisStatus, SynthesisEvent } from '../core/speech/synthesis/contracts';
import type { TranslationInput, TranslationStatus, TranslationEvent } from '../core/speech/translation/contracts';
import type { SpeechInput, SpeechStatus, SpeechEvent } from '../core/speech/recognition';
import type { Composition, CompositionClip } from '../core/editing/composition/document';
import type { LibraryAssetQuery, LibraryAssetPage, LibraryAssetPreview, LibraryLinkKind, LibraryLink, LibraryAvailability } from '../core/library/library-types';
import type { AudioSource, Soundtrack } from '../core/editing/soundtrack';
import type { RecoverySummary, RecoverySave, RecoveryIdentity, RecoveryOpened } from '../core/projects/recovery/recovery-types';
import type { CatalogSnapshot } from '../core/catalog/catalog-snapshot';
import type { MutationIdentity, Page } from '../core/catalog/catalog-types';
import type { Label, SaveLabel, ContentLabels } from '../core/taxonomy/taxonomy-types';
import type { Channel, SaveChannel, AffiliateLink, SaveAffiliate, Post, PostQuery, CreatePost, EditPost, ExportChoice } from '../core/distribution/distribution-types';
import type { ProcessingProfile, SaveProfile, ProfileDocument } from '../core/profiles/profile-types';
import type { Workflow, SaveWorkflow } from '../core/automation/workflow-types';
import type { ModelStatus, VisionInput, VisionResult } from '../core/vision/vision';
import type { FolderSnapshot, FolderCreate } from '../core/folders/folder-types';
import type { BatchSnapshot, BatchSubmit, BatchSelection } from '../core/batch/batch-types';
import type { Reply } from './bridge/client';
import type { EditorSnapshot } from '../core/projects/project';
import type { PublicVideo } from '../core/media/media-types';
import type { SettingsSnapshot } from '../core/settings/settings-types';
import type {
  LibraryPage, LibraryQuery, LibraryImportOptions, LibraryImportResult,
  LibraryImportProgress, LibraryItem, LibraryDependencies,
} from '../core/library/library-types';
type VisionJobEvent = { id: string; revision: number } & (
  | { event: 'progress'; data: { phase: string; fraction: number | null } }
  | { event: 'result'; data: VisionResult }
  | { event: 'error'; data: { code: string } }
);
export {};
declare global {
 interface Window {
  reupmatic: {
   recoveryList():Promise<Reply<RecoverySummary[]>>;
   recoverySave(input:RecoverySave):Promise<Reply<{revision:number;updated_at:number}>>;
   recoveryOpen(input:RecoveryIdentity):Promise<Reply<RecoveryOpened|null>>;
   recoveryDiscard(input:RecoveryIdentity):Promise<Reply<{removed:boolean}>>;
   onRecoveryFlush(cb:(input:{request_id:string})=>void):()=>void;
   recoveryFlushResult(id:string,saved:boolean):Promise<Reply<{accepted:boolean}>>;
   catalogSnapshot():Promise<Reply<CatalogSnapshot>>;
   onCatalogChanged(cb:()=>void):()=>void;
   catalogSaveLabel(input:SaveLabel):Promise<Reply<Label>>;
   catalogContentLabels(input:MutationIdentity & {label_ids:string[]}):Promise<Reply<ContentLabels>>;
   channelSave(input:SaveChannel):Promise<Reply<Channel>>;
   affiliateSave(input:SaveAffiliate):Promise<Reply<AffiliateLink>>;
   postList(input:PostQuery):Promise<Reply<Page<Post>>>;
   postExportChoices():Promise<Reply<ExportChoice[]>>;
   postCreate(input:CreatePost):Promise<Reply<Post>>;
   postEdit(input:EditPost):Promise<Reply<Post>>;
   postReveal(id:string):Promise<Reply<{revealed:boolean}>>;
   profileSave(input:SaveProfile):Promise<Reply<ProcessingProfile>>;
   profileRead():Promise<Reply<ProfileDocument|null>>;
   profileExport(id:string):Promise<Reply<{name:string}|null>>;
   workflowPickOutput():Promise<Reply<{output_id:string;name:string}|null>>;
   workflowSave(input:SaveWorkflow):Promise<Reply<Workflow>>;
   workflowRun(input:{workflow_id:string;expected_revision:number;request_id:string}):Promise<Reply<{id:string}>>;
   libraryAssets(input:LibraryAssetQuery):Promise<Reply<LibraryAssetPage>>;
   libraryAssetAttach(input:{item_id:string;kind:LibraryLinkKind}):Promise<Reply<LibraryLink|null>>;
   libraryAssetCheck(input:{item_id:string;link_id:string}):Promise<Reply<{availability:LibraryAvailability}>>;
   libraryAssetPreview(input:{item_id:string;link_id:string}):Promise<Reply<LibraryAssetPreview>>;
   libraryList(query:LibraryQuery):Promise<Reply<LibraryPage>>;
   libraryImport(options:LibraryImportOptions):Promise<Reply<LibraryImportResult|null>>;
   libraryCancelImport():Promise<Reply<{requested:boolean}>>;
   libraryOpen(id:string):Promise<Reply<PublicVideo>>;
   libraryOpenProject(itemId:string,linkId:string):Promise<Reply<{media:PublicVideo;snapshot:EditorSnapshot}|null>>;
   libraryRelink(id:string):Promise<Reply<LibraryItem|null>>;
   libraryDependencies(id:string):Promise<Reply<LibraryDependencies>>;
   libraryForget(id:string):Promise<Reply<{removed:boolean}>>;
   libraryReveal(itemId:string,linkId?:string):Promise<Reply<{revealed:boolean}>>;
   onLibraryChanged(cb:()=>void):()=>void;
   onLibraryImport(cb:(progress:LibraryImportProgress)=>void):()=>void;
   batchFromLibrary(ids:string[]):Promise<Reply<BatchSelection>>;
   settingsSnapshot():Promise<Reply<SettingsSnapshot>>;
   settingsPickOutput():Promise<Reply<SettingsSnapshot|null>>;
   settingsClearOutput():Promise<Reply<SettingsSnapshot>>;
   settingsPickModels():Promise<Reply<SettingsSnapshot|null>>;
   settingsCancelModels():Promise<Reply<{requested:boolean}>>;
   onModelsChanged(cb:()=>void):()=>void;
   synthesisStatus():Promise<Reply<SynthesisStatus>>;
   synthesisStart(input:SynthesisInput):Promise<Reply<{request_id:string;revision:number}>>;
   synthesisCancel(id:string):Promise<Reply<{requested:boolean}>>;
   synthesisConfigure():Promise<Reply<SynthesisStatus|null>>;
   synthesisCancelSetup():Promise<Reply<{requested:boolean}>>;
   synthesisPreview(id:string):Promise<Reply<{url:string}>>;
   synthesisChooseExport(id:string,kind:'wav'|'receipt'):Promise<Reply<{choice_id:string;name:string}|null>>;
   synthesisSave(choiceId:string,artifactId:string):Promise<Reply<{name:string}>>;
   synthesisCancelExport():Promise<Reply<{requested:boolean}>>;
   onSynthesisJob(cb:(message:SynthesisEvent)=>void):()=>void;
   onSynthesisModelsChanged(cb:()=>void):()=>void;
   translationStatus():Promise<Reply<TranslationStatus>>;
   translationStart(input:TranslationInput):Promise<Reply<{request_id:string;revision:number}>>;
   translationCancel(id:string):Promise<Reply<{requested:boolean}>>;
   translationConfigure():Promise<Reply<TranslationStatus|null>>;
   translationCancelSetup():Promise<Reply<{requested:boolean}>>;
   onTranslationJob(cb:(message:TranslationEvent)=>void):()=>void;
   onTranslationModelsChanged(cb:()=>void):()=>void;
   speechStatus():Promise<Reply<SpeechStatus>>;
   speechStart(input:SpeechInput):Promise<Reply<{request_id:string;revision:number}>>;
   speechCancel(id:string):Promise<Reply<{requested:boolean}>>;
   speechConfigure():Promise<Reply<SpeechStatus|null>>;
   speechCancelSetup():Promise<Reply<{requested:boolean}>>;
   onSpeechJob(cb:(message:SpeechEvent)=>void):()=>void;
   onSpeechModelsChanged(cb:()=>void):()=>void;
   visionStatus():Promise<Reply<ModelStatus>>;
   visionStart(input:VisionInput):Promise<Reply<{request_id:string;revision:number}>>;
   visionCancel(id:string):Promise<Reply<{requested:boolean}>>;
   onVisionJob(cb:(message:VisionJobEvent)=>void):()=>void;
   compositionStart(assetId:string):Promise<Reply<Composition>>;
   compositionPick():Promise<Reply<CompositionClip[]|null>>;
   compositionPreview(input:Composition):Promise<Reply<{clips:{id:string;url:string}[]}>>;
   audioPick():Promise<Reply<AudioSource|null>>;
   audioPreview(input:Soundtrack):Promise<Reply<{url:string}>>;
   hello():Promise<any>;open():Promise<any>;importSubtitles():Promise<any>;ass(input:unknown):Promise<any>;
   peaks(input:unknown):Promise<any>;render(input:unknown):Promise<any>;cancel(id:string):Promise<any>;
   saveSubtitles(input:unknown):Promise<any>;saveVideo(id:string):Promise<any>;
   openProject():Promise<any>;saveProject(input:unknown):Promise<any>;
   batchSnapshot():Promise<Reply<BatchSnapshot>>;
   batchPickVideos():Promise<Reply<BatchSelection|null>>;
   batchPickSubtitle():Promise<Reply<{subtitle_id:string;subtitle_name:string}|null>>;
   batchPickDirectory():Promise<Reply<{output_id:string;name:string}|null>>;
   batchEnqueue(input:BatchSubmit):Promise<Reply<BatchSnapshot>>;
   batchPause():Promise<Reply<BatchSnapshot>>;batchResume():Promise<Reply<BatchSnapshot>>;
   batchCancel(id:string):Promise<Reply<BatchSnapshot>>;batchRetry(id:string):Promise<Reply<BatchSnapshot>>;
   batchReveal(id:string):Promise<Reply<{revealed:boolean}>>;
   onBatch(cb:(snapshot:BatchSnapshot)=>void):()=>void;
   folderSnapshot():Promise<Reply<FolderSnapshot>>;
   folderPickSource():Promise<Reply<{directory_id:string;name:string}|null>>;
   folderPickOutput():Promise<Reply<{directory_id:string;name:string}|null>>;
   folderCreate(input:FolderCreate):Promise<Reply<FolderSnapshot>>;
   folderStart(id:string):Promise<Reply<FolderSnapshot>>;folderPause(id:string):Promise<Reply<FolderSnapshot>>;
   onFolders(cb:(snapshot:FolderSnapshot)=>void):()=>void;
   dirty(dirty:boolean,language:string):Promise<any>;onJob(cb:(message:any)=>void):()=>void;
  }
 }
}
