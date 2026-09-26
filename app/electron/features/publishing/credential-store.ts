import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ChannelConnectionState } from '../../../core/distribution/distribution-contracts.js';
import type { DestinationCredentials } from '../../../core/distribution/publishing/contracts.js';

/** The safeStorage surface needed; declared locally so tests never load Electron. */
export interface CredentialEncryption {
  isEncryptionAvailable(): boolean;
  encryptString(value: string): Buffer;
  decryptString(value: Buffer): string;
}

export interface ChannelAccount {
  channel_id: string;
  account_id: string;
  account_name: string;
  connected_at: number;
}

interface StoredAccount extends ChannelAccount {
  reauthorize: boolean;
}

interface StoredFile {
  accounts: StoredAccount[];
}

function shortId(): string {
  return randomBytes(8).toString('hex');
}

function assertChannelId(id: string): string {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{8,128}$/.test(id))
    throw new Error('INVALID_REQUEST');
  return id;
}

/** Page tokens live here, OS-encrypted, keyed by channel id; only display data ever leaves. */
export class ChannelCredentialStore {
  #directory: string;
  #file: string;
  #encryption: CredentialEncryption;
  #states: Record<string, ChannelConnectionState> = {};

  constructor(directory: string, encryption: CredentialEncryption) {
    this.#directory = directory;
    this.#file = path.join(directory, 'channels.json');
    this.#encryption = encryption;
  }

  #tokenPath(channelId: string): string {
    return path.join(this.#directory, `${assertChannelId(channelId)}.token`);
  }

  async #read(): Promise<StoredFile> {
    let raw: string;
    try {
      raw = await readFile(this.#file, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { accounts: [] };
      throw new Error('CHANNEL_CREDENTIAL_STORE_INVALID');
    }
    try {
      const value = JSON.parse(raw) as StoredFile;
      if (!value || !Array.isArray(value.accounts)) throw new Error();
      return value;
    } catch {
      throw new Error('CHANNEL_CREDENTIAL_STORE_INVALID');
    }
  }

  async #write(value: StoredFile): Promise<void> {
    await mkdir(this.#directory, { recursive: true });
    const temporary = path.join(this.#directory, `.channels-${shortId()}.tmp`);
    try {
      await writeFile(temporary, JSON.stringify(value, null, 2), 'utf-8');
      await rename(temporary, this.#file);
    } finally {
      await rm(temporary, { force: true });
    }
    this.#refresh(value);
  }

  #refresh(stored: StoredFile): void {
    const states: Record<string, ChannelConnectionState> = {};
    for (const account of stored.accounts)
      states[account.channel_id] = {
        connection: account.reauthorize ? 'reauthorize' : 'connected',
        account_name: account.account_name,
      };
    this.#states = states;
  }

  /** Loads the connection index at startup so the sync snapshot path can read it. */
  async load(): Promise<void> {
    this.#refresh(await this.#read());
  }

  /** Connection state and display name for the renderer: no token ever crosses this method. */
  accounts(): Readonly<Record<string, ChannelConnectionState>> {
    return this.#states;
  }

  async account(channelId: string): Promise<ChannelAccount | undefined> {
    const stored = await this.#read();
    const account = stored.accounts.find((candidate) => candidate.channel_id === channelId);
    if (!account) return undefined;
    return {
      channel_id: account.channel_id,
      account_id: account.account_id,
      account_name: account.account_name,
      connected_at: account.connected_at,
    };
  }

  /** The only path a token leaves the store; callers must never log or forward it over IPC. */
  async credentials(channelId: string): Promise<DestinationCredentials | undefined> {
    const stored = await this.#read();
    const account = stored.accounts.find((candidate) => candidate.channel_id === channelId);
    if (!account) return undefined;
    let raw: Buffer;
    try {
      raw = await readFile(this.#tokenPath(channelId));
    } catch {
      return undefined;
    }
    if (!this.#encryption.isEncryptionAvailable())
      throw new Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    let access_token: string;
    try {
      access_token = this.#encryption.decryptString(raw);
    } catch {
      throw new Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    }
    return { account_id: account.account_id, access_token };
  }

  async save(
    channelId: string,
    input: { account_id: string; account_name: string; access_token: string },
    now = Date.now(),
  ): Promise<ChannelAccount> {
    assertChannelId(channelId);
    if (!input.access_token || input.access_token.length > 8192) throw new Error('INVALID_REQUEST');
    if (!input.account_id || input.account_id.length > 256) throw new Error('INVALID_REQUEST');
    if (!this.#encryption.isEncryptionAvailable())
      throw new Error('CREDENTIAL_ENCRYPTION_UNAVAILABLE');
    const stored = await this.#read();
    const account: StoredAccount = {
      channel_id: channelId,
      account_id: input.account_id,
      account_name: input.account_name.slice(0, 256),
      connected_at: now,
      reauthorize: false,
    };
    await this.#write({
      accounts: [
        ...stored.accounts.filter((candidate) => candidate.channel_id !== channelId),
        account,
      ],
    });
    await mkdir(this.#directory, { recursive: true });
    await writeFile(this.#tokenPath(channelId), this.#encryption.encryptString(input.access_token));
    const { reauthorize: _reauthorize, ...presented } = account;
    return presented;
  }

  async markReauthorize(channelId: string): Promise<void> {
    const stored = await this.#read();
    if (!stored.accounts.some((candidate) => candidate.channel_id === channelId)) return;
    await this.#write({
      accounts: stored.accounts.map((candidate) =>
        candidate.channel_id === channelId ? { ...candidate, reauthorize: true } : candidate,
      ),
    });
  }

  async remove(channelId: string): Promise<void> {
    const stored = await this.#read();
    await this.#write({
      accounts: stored.accounts.filter((candidate) => candidate.channel_id !== channelId),
    });
    await rm(this.#tokenPath(channelId), { force: true });
  }
}
