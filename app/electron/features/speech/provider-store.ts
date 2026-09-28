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

/** The async safeStorage surface needed; declared locally so tests never load Electron. */
export interface CredentialEncryption {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean }>;
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

/** BYOK provider registry; credentials are OS-encrypted and never logged or echoed. */
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
    if (!(await this.#encryption.isAsyncEncryptionAvailable())) {
      throw new RemoteError('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    }
    const encrypted = await this.#encryption.encryptStringAsync(credential);
    const stored = await this.#read();
    const id = shortId();
    const provider: StoredProvider = { ...draft, id, models: [] };
    await this.#write({ providers: [...stored.providers, provider] });
    await mkdir(this.#directory, { recursive: true });
    await writeFile(this.#credentialPath(id), encrypted);
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
    if (!(await this.#encryption.isAsyncEncryptionAvailable())) {
      throw new RemoteError('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    }
    const stored = await this.#read();
    await this.#find(stored, id);
    const encrypted = await this.#encryption.encryptStringAsync(credential);
    await mkdir(this.#directory, { recursive: true });
    await writeFile(this.#credentialPath(id), encrypted);
  }

  async removeCredential(id: string): Promise<void> {
    const stored = await this.#read();
    await this.#find(stored, id);
    await rm(this.#credentialPath(id), { force: true });
  }

  /** Returns the credential via env; undefined when none is stored, never an empty guess. */
  async credentialEnv(id: string): Promise<Record<string, string> | undefined> {
    let raw: Buffer;
    try {
      raw = await readFile(this.#credentialPath(id));
    } catch {
      return undefined;
    }
    const { result, shouldReEncrypt } = await this.#encryption.decryptStringAsync(raw);
    // The OS rotated its key: store the same plaintext under the current one.
    if (shouldReEncrypt)
      await writeFile(this.#credentialPath(id), await this.#encryption.encryptStringAsync(result));
    return { [HOSTED_CREDENTIAL_ENV_VAR]: result };
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
