import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  assertProtocolImplemented,
  HOSTED_CREDENTIAL_ENV_VAR,
  hostedModelIdentity,
  IMPLEMENTED_PROTOCOLS,
  parseModelDraft,
  parseProviderDraft,
  type SpeechProvider,
} from '../../../core/speech/providers.js';
import { RemoteError } from '../../../core/worker/remote-error.js';

/**
 * The exact `safeStorage` surface this store needs, declared locally rather than imported from
 * `electron` — so this file (and its unit tests) never load the real Electron module. The one
 * real caller (`app/electron/main.ts`) passes Electron's actual `safeStorage`, which already
 * satisfies this shape; a test passes a fake with the same shape instead.
 */
export interface CredentialEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

interface StoredModel {
  id: string;
  remote_model_name: string;
  languages: string[];
  max_duration_ms: number;
}
interface StoredProvider {
  id: string;
  display_name: string;
  protocol: string;
  endpoint_host: string;
  models: StoredModel[];
}
interface StoredFile {
  providers: StoredProvider[];
}

function shortId(): string {
  return randomBytes(8).toString('hex');
}

/**
 * BYOK/BYO-model registry (D-55): several hosted providers, several models under each, added,
 * edited and removed without a code change. Non-secret configuration (display name, protocol,
 * endpoint host, remote model name, languages, limits) lives in one plain JSON file in its own
 * directory — never the worker's job workspace, since none of this is a job file. A credential
 * lives only as an OS-encrypted blob alongside it, one file per provider, and is never read back
 * out except to build the environment a future hosted child receives it through (`credentialEnv`
 * — no child calls it yet; ticket 06 is where one first would). Removing a provider removes its
 * credential file. Nothing here ever logs, echoes or serializes a plaintext credential.
 */
export class SpeechProviderStore {
  #directory: string;
  #file: string;
  #encryption: CredentialEncryption;
  #implemented: ReadonlySet<string>;

  constructor(
    directory: string,
    encryption: CredentialEncryption,
    implemented: ReadonlySet<string> = IMPLEMENTED_PROTOCOLS,
  ) {
    this.#directory = directory;
    this.#file = path.join(directory, 'providers.json');
    this.#encryption = encryption;
    this.#implemented = implemented;
  }

  #credentialPath(id: string): string {
    return path.join(this.#directory, `${id}.credential`);
  }

  async #hasCredential(id: string): Promise<boolean> {
    try {
      await readFile(this.#credentialPath(id));
      return true;
    } catch {
      return false;
    }
  }

  async #read(): Promise<StoredFile> {
    let raw: string;
    try {
      raw = await readFile(this.#file, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { providers: [] };
      throw new RemoteError('SPEECH_PROVIDER_STORE_INVALID');
    }
    try {
      const value = JSON.parse(raw);
      if (!value || typeof value !== 'object' || !Array.isArray(value.providers)) {
        throw new Error();
      }
      return value as StoredFile;
    } catch {
      throw new RemoteError('SPEECH_PROVIDER_STORE_INVALID');
    }
  }

  async #write(value: StoredFile): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const temp = path.join(this.#directory, `.providers-${shortId()}.tmp`);
    try {
      await writeFile(temp, JSON.stringify(value, null, 2), 'utf-8');
      await rename(temp, this.#file);
    } finally {
      await rm(temp, { force: true });
    }
  }

  #present(provider: StoredProvider, hasCredential: boolean): SpeechProvider {
    return {
      id: provider.id,
      display_name: provider.display_name,
      protocol: provider.protocol,
      endpoint_host: provider.endpoint_host,
      has_credential: hasCredential,
      models: provider.models.map((model) => ({
        id: model.id,
        remote_model_name: model.remote_model_name,
        languages: model.languages as SpeechProvider['models'][number]['languages'],
        max_duration_ms: model.max_duration_ms,
        model_id: hostedModelIdentity({
          protocol: provider.protocol,
          remote_model_name: model.remote_model_name,
          endpoint_host: provider.endpoint_host,
        }),
      })),
    };
  }

  async list(): Promise<SpeechProvider[]> {
    const stored = await this.#read();
    const providers: SpeechProvider[] = [];
    for (const provider of stored.providers) {
      providers.push(this.#present(provider, await this.#hasCredential(provider.id)));
    }
    return providers;
  }

  async #find(stored: StoredFile, id: string): Promise<StoredProvider> {
    const provider = stored.providers.find((candidate) => candidate.id === id);
    if (!provider) throw new RemoteError('SPEECH_PROVIDER_NOT_FOUND');
    return provider;
  }

  async addProvider(draftInput: unknown, credential: string): Promise<SpeechProvider> {
    const draft = parseProviderDraft(draftInput);
    assertProtocolImplemented(draft.protocol, this.#implemented);
    if (typeof credential !== 'string' || !credential || credential.length > 4096) {
      throw new RemoteError('INVALID_REQUEST');
    }
    if (!this.#encryption.isEncryptionAvailable()) {
      throw new RemoteError('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    }
    const stored = await this.#read();
    const id = shortId();
    const provider: StoredProvider = { ...draft, id, models: [] };
    await this.#write({ providers: [...stored.providers, provider] });
    await mkdir(this.#directory, { recursive: true });
    await writeFile(this.#credentialPath(id), this.#encryption.encryptString(credential));
    return this.#present(provider, true);
  }

  async updateProvider(id: string, draftInput: unknown): Promise<SpeechProvider> {
    const draft = parseProviderDraft(draftInput);
    assertProtocolImplemented(draft.protocol, this.#implemented);
    const stored = await this.#read();
    const existing = await this.#find(stored, id);
    const updated: StoredProvider = { ...existing, ...draft };
    await this.#write({
      providers: stored.providers.map((provider) => (provider.id === id ? updated : provider)),
    });
    return this.#present(updated, await this.#hasCredential(id));
  }

  async removeProvider(id: string): Promise<void> {
    const stored = await this.#read();
    await this.#find(stored, id);
    await this.#write({
      providers: stored.providers.filter((provider) => provider.id !== id),
    });
    await rm(this.#credentialPath(id), { force: true });
  }

  async setCredential(id: string, credential: string): Promise<void> {
    if (typeof credential !== 'string' || !credential || credential.length > 4096) {
      throw new RemoteError('INVALID_REQUEST');
    }
    if (!this.#encryption.isEncryptionAvailable()) {
      throw new RemoteError('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    }
    const stored = await this.#read();
    await this.#find(stored, id);
    await mkdir(this.#directory, { recursive: true });
    await writeFile(this.#credentialPath(id), this.#encryption.encryptString(credential));
  }

  async removeCredential(id: string): Promise<void> {
    const stored = await this.#read();
    await this.#find(stored, id);
    await rm(this.#credentialPath(id), { force: true });
  }

  /** The mechanism by which a hosted child receives its provider's credential — through its own
   * environment, never through the job file the worker writes into the workspace (spec
   * "Providers, models and credentials"). `SpeechCoordinator` calls this per job (ticket 06) and
   * hands the value on to the worker, which places it in the hosted child's environment; it is
   * never written to any file this store or the worker owns. Returns `undefined`, never a
   * decrypted empty guess, when no credential is stored. */
  async credentialEnv(id: string): Promise<Record<string, string> | undefined> {
    let raw: Buffer;
    try {
      raw = await readFile(this.#credentialPath(id));
    } catch {
      return undefined;
    }
    return { [HOSTED_CREDENTIAL_ENV_VAR]: this.#encryption.decryptString(raw) };
  }

  async addModel(providerId: string, draftInput: unknown): Promise<SpeechProvider> {
    const draft = parseModelDraft(draftInput);
    const stored = await this.#read();
    const existing = await this.#find(stored, providerId);
    const model: StoredModel = { ...draft, id: shortId() };
    const updated: StoredProvider = { ...existing, models: [...existing.models, model] };
    await this.#write({
      providers: stored.providers.map((provider) =>
        provider.id === providerId ? updated : provider,
      ),
    });
    return this.#present(updated, await this.#hasCredential(providerId));
  }

  async updateModel(
    providerId: string,
    modelKey: string,
    draftInput: unknown,
  ): Promise<SpeechProvider> {
    const draft = parseModelDraft(draftInput);
    const stored = await this.#read();
    const existing = await this.#find(stored, providerId);
    if (!existing.models.some((model) => model.id === modelKey)) {
      throw new RemoteError('SPEECH_MODEL_NOT_FOUND');
    }
    const updated: StoredProvider = {
      ...existing,
      models: existing.models.map((model) =>
        model.id === modelKey ? { ...draft, id: modelKey } : model,
      ),
    };
    await this.#write({
      providers: stored.providers.map((provider) =>
        provider.id === providerId ? updated : provider,
      ),
    });
    return this.#present(updated, await this.#hasCredential(providerId));
  }

  async removeModel(providerId: string, modelKey: string): Promise<SpeechProvider> {
    const stored = await this.#read();
    const existing = await this.#find(stored, providerId);
    if (!existing.models.some((model) => model.id === modelKey)) {
      throw new RemoteError('SPEECH_MODEL_NOT_FOUND');
    }
    const updated: StoredProvider = {
      ...existing,
      models: existing.models.filter((model) => model.id !== modelKey),
    };
    await this.#write({
      providers: stored.providers.map((provider) =>
        provider.id === providerId ? updated : provider,
      ),
    });
    return this.#present(updated, await this.#hasCredential(providerId));
  }
}
