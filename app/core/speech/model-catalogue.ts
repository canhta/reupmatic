import { readFile } from 'node:fs/promises';
import { type LocalisedText, UI_LOCALES } from '../ui-locale.js';
import { RemoteError } from '../worker/remote-error.js';
import type { SpeechLanguage } from './recognition.js';
import type { TranslationLanguage } from './translation/rules.js';

export const MODEL_TASKS = ['recognition', 'synthesis', 'translation', 'vision'] as const;
export type ModelTask = (typeof MODEL_TASKS)[number];

const VISION_LANGUAGES: readonly SpeechLanguage[] = ['en', 'vi', 'zh'];
const VISION_VERSIONS: readonly string[] = ['PP-OCRv3', 'PP-OCRv4', 'PP-OCRv5'];
const VISION_HEIGHTS: readonly number[] = [32, 48];

const TRANSLATION_REQUIRED = ['model.bin', 'config.json', 'source.spm', 'target.spm'] as const;
const TRANSLATION_VOCABULARIES: readonly (readonly string[])[] = [
  ['shared_vocabulary.json'],
  ['source_vocabulary.json', 'target_vocabulary.json'],
];

export const ARCHITECTURES_BY_TASK: ReadonlyMap<ModelTask, ReadonlySet<string>> = new Map([
  ['recognition', new Set<string>(['faster-whisper'])],
  [
    'synthesis',
    new Set<string>([
      'vieneu-v3-nano-onnx',
      'vieneu-v3-turbo-onnx',
      // The optional clone add-on for Turbo; installed beside the Turbo bundle, never inside it.
      'vieneu-v3-turbo-clone-onnx',
    ]),
  ],
  ['translation', new Set<string>(['ctranslate2-sentencepiece'])],
  ['vision', new Set<string>(['rapidocr-lama'])],
]);

export const IMPLEMENTED_ARCHITECTURES: ReadonlySet<string> = new Set<string>(
  [...ARCHITECTURES_BY_TASK.values()].flatMap((architectures) => [...architectures]),
);

const LANGUAGES: readonly SpeechLanguage[] = ['en', 'vi', 'zh'];
const MAX_FILE_SIZE = 8 * 1024 ** 3;
const MAX_TOTAL_SIZE = 64 * 1024 ** 3;
const BASE_KEYS = [
  'id',
  'task',
  'engine',
  'purpose',
  'licence',
  'source_host',
  'files',
  'download_size',
  'on_disk_size',
] as const;
const SPEECH_KEYS = [...BASE_KEYS, 'languages'] as const;
const TRANSLATION_KEYS = [...BASE_KEYS, 'source_language', 'target_language'] as const;
const VISION_KEYS = [...BASE_KEYS, 'ocr', 'inpainting'] as const;
const FILE_KEYS = ['name', 'path', 'sha256', 'size'] as const;

export interface CatalogueFile {
  readonly name: string;
  /** URL path relative to the entry's `source_host`. */
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
}

interface CatalogueModelBase {
  readonly id: string;
  readonly engine: string;
  readonly purpose: LocalisedText;
  readonly licence: string;
  readonly source_host: string;
  readonly files: CatalogueFile[];
  readonly download_size: number;
  readonly on_disk_size: number;
}

export interface SpeechCatalogueModel extends CatalogueModelBase {
  readonly task: 'recognition' | 'synthesis';
  readonly languages: SpeechLanguage[];
}

export interface TranslationCatalogueModel extends CatalogueModelBase {
  readonly task: 'translation';
  readonly source_language: TranslationLanguage;
  readonly target_language: TranslationLanguage;
}

export interface VisionOcrPack {
  readonly det: string;
  readonly rec: string;
  readonly keys: string;
  readonly det_version: string;
  readonly rec_version: string;
  readonly rec_height: number;
}

export interface VisionCatalogueModel extends CatalogueModelBase {
  readonly task: 'vision';
  readonly ocr?: Partial<Record<SpeechLanguage, VisionOcrPack>>;
  readonly inpainting?: { readonly model: string };
}

export type CatalogueModel =
  | SpeechCatalogueModel
  | TranslationCatalogueModel
  | VisionCatalogueModel;

export interface CatalogueRefusal {
  readonly id: string;
  readonly code: string;
}

export interface Catalogue {
  readonly models: CatalogueModel[];
  readonly refused: CatalogueRefusal[];
}

export type OfferedModel = CatalogueModel & { readonly installed: boolean };

export interface ActiveInstall {
  readonly request_id: string;
  readonly catalogue_id: string;
  readonly phase: string;
  readonly fraction: number | null;
}

export interface OfferedCatalogue {
  readonly models: OfferedModel[];
  readonly refused: CatalogueRefusal[];
  readonly active: ActiveInstall | null;
}

export type ModelInstallEvent = { id: string } & (
  | { event: 'progress'; data: { phase: string; fraction: number | null } }
  | { event: 'result'; data: { catalogue_id: string } }
  | { event: 'error'; data: { code: string } }
);

function plain(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => key in value);
}
function text(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' && value.length > 0 && value.length <= max && !value.includes('\0')
  );
}
function boundedInt(value: unknown, max: number): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= max;
}
function hash(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}

function parsePurpose(value: unknown): LocalisedText {
  if (!plain(value) || !exact(value, UI_LOCALES)) throw new RemoteError('MODEL_CATALOGUE_INVALID');
  const purpose: Record<string, string> = {};
  for (const locale of UI_LOCALES) {
    if (!text(value[locale], 280)) throw new RemoteError('MODEL_CATALOGUE_INVALID');
    purpose[locale] = value[locale] as string;
  }
  return purpose as LocalisedText;
}

// Refuses .., absolute paths, backslashes and empty segments so a name cannot escape the bundle.
function relativeName(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 256 || !value) return false;
  return value
    .split('/')
    .every(
      (segment) => segment !== '.' && segment !== '..' && /^[A-Za-z0-9._-]{1,128}$/.test(segment),
    );
}

function parseFile(value: unknown): CatalogueFile {
  if (
    !plain(value) ||
    !exact(value, FILE_KEYS) ||
    !relativeName(value.name) ||
    !text(value.path, 1024) ||
    value.path.startsWith('/') ||
    value.path.includes('://') ||
    value.path.includes('\\') ||
    value.path.split('/').some((segment) => segment === '..') ||
    !hash(value.sha256) ||
    !boundedInt(value.size, MAX_FILE_SIZE)
  ) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  return { name: value.name, path: value.path, sha256: value.sha256, size: value.size };
}

function parseCommon(value: Record<string, unknown>) {
  if (
    typeof value.id !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value.id) ||
    !text(value.licence, 120) ||
    typeof value.source_host !== 'string' ||
    !/^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value.source_host) ||
    !Array.isArray(value.files) ||
    value.files.length < 1 ||
    value.files.length > 64 ||
    !boundedInt(value.download_size, MAX_TOTAL_SIZE) ||
    !boundedInt(value.on_disk_size, MAX_TOTAL_SIZE)
  ) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  const files = value.files.map(parseFile);
  if (new Set(files.map((file) => file.name)).size !== files.length) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  const declared = files.reduce((sum, file) => sum + file.size, 0);
  if (declared !== value.download_size || value.on_disk_size < declared) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  return {
    id: value.id,
    engine: value.engine as string,
    purpose: parsePurpose(value.purpose),
    licence: value.licence,
    source_host: value.source_host,
    files,
    download_size: value.download_size,
    on_disk_size: value.on_disk_size,
  };
}

function parseSpeechModel(
  value: Record<string, unknown>,
  common: ReturnType<typeof parseCommon>,
): SpeechCatalogueModel {
  if (
    !Array.isArray(value.languages) ||
    value.languages.length < 1 ||
    value.languages.length > 3 ||
    new Set(value.languages).size !== value.languages.length ||
    value.languages.some((language) => !LANGUAGES.includes(language as SpeechLanguage))
  ) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  return {
    ...common,
    task: value.task as 'recognition' | 'synthesis',
    languages: value.languages as SpeechLanguage[],
  };
}

function translationLanguage(value: unknown): TranslationLanguage {
  if (typeof value !== 'string' || !LANGUAGES.includes(value as SpeechLanguage)) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  return value as TranslationLanguage;
}

function parseTranslationModel(
  value: Record<string, unknown>,
  common: ReturnType<typeof parseCommon>,
): TranslationCatalogueModel {
  const source = translationLanguage(value.source_language);
  const target = translationLanguage(value.target_language);
  if (source === target) throw new RemoteError('MODEL_CATALOGUE_INVALID');
  const names = new Set(common.files.map((file) => file.name));
  if (!TRANSLATION_REQUIRED.every((name) => names.has(name))) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  const layouts = TRANSLATION_VOCABULARIES.filter((layout) =>
    layout.every((name) => names.has(name)),
  );
  if (layouts.length !== 1) throw new RemoteError('MODEL_CATALOGUE_INVALID');
  const allowed = new Set<string>([...TRANSLATION_REQUIRED, ...layouts[0], 'vmap.txt']);
  if ([...names].some((name) => !allowed.has(name))) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  return { ...common, task: 'translation', source_language: source, target_language: target };
}

const OCR_PACK_KEYS = ['det', 'rec', 'keys', 'det_version', 'rec_version', 'rec_height'] as const;

function parseVisionModel(
  value: Record<string, unknown>,
  common: ReturnType<typeof parseCommon>,
): VisionCatalogueModel {
  const names = new Set(common.files.map((file) => file.name));
  const referenced = new Set<string>();
  const hasOcr = 'ocr' in value;
  const hasInpainting = 'inpainting' in value;
  if (!hasOcr && !hasInpainting) throw new RemoteError('MODEL_CATALOGUE_INVALID');
  let ocr: Partial<Record<SpeechLanguage, VisionOcrPack>> | undefined;
  if (hasOcr) {
    const raw = value.ocr;
    if (!plain(raw)) throw new RemoteError('MODEL_CATALOGUE_INVALID');
    const languages = Object.keys(raw);
    if (
      languages.length < 1 ||
      languages.length > 3 ||
      languages.some((language) => !VISION_LANGUAGES.includes(language as SpeechLanguage))
    ) {
      throw new RemoteError('MODEL_CATALOGUE_INVALID');
    }
    ocr = {};
    for (const language of languages) {
      const pack = raw[language];
      if (
        !plain(pack) ||
        !exact(pack, OCR_PACK_KEYS) ||
        typeof pack.det !== 'string' ||
        typeof pack.rec !== 'string' ||
        typeof pack.keys !== 'string' ||
        ![pack.det, pack.rec, pack.keys].every((name) => names.has(name)) ||
        typeof pack.det_version !== 'string' ||
        !VISION_VERSIONS.includes(pack.det_version) ||
        typeof pack.rec_version !== 'string' ||
        !VISION_VERSIONS.includes(pack.rec_version) ||
        !Number.isInteger(pack.rec_height) ||
        !VISION_HEIGHTS.includes(pack.rec_height as number)
      ) {
        throw new RemoteError('MODEL_CATALOGUE_INVALID');
      }
      referenced.add(pack.det);
      referenced.add(pack.rec);
      referenced.add(pack.keys);
      ocr[language as SpeechLanguage] = {
        det: pack.det,
        rec: pack.rec,
        keys: pack.keys,
        det_version: pack.det_version,
        rec_version: pack.rec_version,
        rec_height: pack.rec_height as number,
      };
    }
  }
  let inpainting: { readonly model: string } | undefined;
  if (hasInpainting) {
    const raw = value.inpainting;
    if (
      !plain(raw) ||
      !exact(raw, ['model']) ||
      typeof raw.model !== 'string' ||
      !names.has(raw.model)
    ) {
      throw new RemoteError('MODEL_CATALOGUE_INVALID');
    }
    referenced.add(raw.model);
    inpainting = { model: raw.model };
  }
  // Every downloaded file must be used by a role; an unreferenced file is refused.
  if ([...names].some((name) => !referenced.has(name))) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  return {
    ...common,
    task: 'vision',
    ...(ocr ? { ocr } : {}),
    ...(inpainting ? { inpainting } : {}),
  };
}

// An unimplemented architecture is refused at configuration time, never at run time.
export function parseCatalogueModel(
  value: unknown,
  architectures: ReadonlyMap<ModelTask, ReadonlySet<string>> = ARCHITECTURES_BY_TASK,
): CatalogueModel {
  if (
    !plain(value) ||
    typeof value.task !== 'string' ||
    !(MODEL_TASKS as readonly string[]).includes(value.task)
  ) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  const task = value.task as ModelTask;
  const shapeOk =
    task === 'recognition' || task === 'synthesis'
      ? exact(value, SPEECH_KEYS)
      : task === 'translation'
        ? exact(value, TRANSLATION_KEYS)
        : Object.keys(value).every((key) => (VISION_KEYS as readonly string[]).includes(key));
  if (!shapeOk) throw new RemoteError('MODEL_CATALOGUE_INVALID');
  const implemented = architectures.get(task);
  if (!implemented || typeof value.engine !== 'string' || !implemented.has(value.engine)) {
    throw new RemoteError('MODEL_ARCHITECTURE_UNIMPLEMENTED');
  }
  const common = parseCommon(value);
  if (task === 'recognition' || task === 'synthesis') return parseSpeechModel(value, common);
  if (task === 'translation') return parseTranslationModel(value, common);
  return parseVisionModel(value, common);
}

export function parseCatalogue(
  value: unknown,
  architectures: ReadonlyMap<ModelTask, ReadonlySet<string>> = ARCHITECTURES_BY_TASK,
): Catalogue {
  if (
    !plain(value) ||
    !exact(value, ['models']) ||
    !Array.isArray(value.models) ||
    value.models.length > 64
  ) {
    throw new RemoteError('MODEL_CATALOGUE_INVALID');
  }
  const models: CatalogueModel[] = [];
  const refused: CatalogueRefusal[] = [];
  const seen = new Set<string>();
  for (const entry of value.models) {
    const id = plain(entry) && typeof entry.id === 'string' ? entry.id : '';
    try {
      const model = parseCatalogueModel(entry, architectures);
      if (seen.has(model.id)) {
        refused.push({ id: model.id, code: 'MODEL_CATALOGUE_INVALID' });
        continue;
      }
      seen.add(model.id);
      models.push(model);
    } catch (error) {
      refused.push({
        id,
        code: error instanceof RemoteError ? error.code : 'MODEL_CATALOGUE_INVALID',
      });
    }
  }
  return { models, refused };
}

export async function readCatalogue(
  paths: readonly string[],
  architectures: ReadonlyMap<ModelTask, ReadonlySet<string>> = ARCHITECTURES_BY_TASK,
): Promise<Catalogue> {
  const byId = new Map<string, unknown>();
  const anonymous: unknown[] = [];
  for (const filename of paths) {
    let raw: string;
    try {
      raw = await readFile(filename, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw new RemoteError('MODEL_CATALOGUE_INVALID');
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      throw new RemoteError('MODEL_CATALOGUE_INVALID');
    }
    if (!plain(value) || !exact(value, ['models']) || !Array.isArray(value.models)) {
      throw new RemoteError('MODEL_CATALOGUE_INVALID');
    }
    for (const entry of value.models) {
      if (plain(entry) && typeof entry.id === 'string') byId.set(entry.id, entry);
      else anonymous.push(entry);
    }
  }
  return parseCatalogue({ models: [...byId.values(), ...anonymous] }, architectures);
}
