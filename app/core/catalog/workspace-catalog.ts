import type { Workflow, WorkflowRun } from '../automation/workflow-contracts.js';
import { WorkflowStore } from '../automation/workflow-store.js';
import type { BatchJobInput } from '../batch/batch-contracts.js';
import type {
  AffiliateLink,
  Channel,
  Post,
  PostQuery,
} from '../distribution/distribution-contracts.js';
import { DistributionStore } from '../distribution/distribution-store.js';
import { PostStore } from '../distribution/post-store.js';
import type { DouyinTag } from '../library/douyin/intake-contracts.js';
import { assignDouyinTags } from '../library/douyin/intake-tags.js';
import type { ContentAsset } from '../library/library-contracts.js';
import type { ProcessingProfile, ProfileDocument } from '../profiles/profile-contracts.js';
import { ProfileStore } from '../profiles/profile-store.js';
import type { ContentLabels, Label } from '../taxonomy/taxonomy-contracts.js';
import { TaxonomyStore } from '../taxonomy/taxonomy-store.js';
import type { Page } from './catalog-contracts.js';
import { CatalogDatabase } from './catalog-database.js';
import type { CatalogSnapshot } from './catalog-snapshot.js';
import { identifier, object } from './validation.js';

export type ResolveExport = (contentId: string, exportId: string) => Promise<ContentAsset>;

export class WorkspaceCatalog {
  readonly #db: CatalogDatabase;
  readonly #taxonomy: TaxonomyStore;
  readonly #distribution: DistributionStore;
  readonly #posts: PostStore;
  readonly #profiles: ProfileStore;
  readonly #workflows: WorkflowStore;
  readonly #resolveExport: ResolveExport;

  constructor(filename: string, resolveExport: ResolveExport) {
    this.#db = new CatalogDatabase(filename);
    this.#taxonomy = new TaxonomyStore(this.#db);
    this.#distribution = new DistributionStore(this.#db, this.#taxonomy);
    this.#posts = new PostStore(this.#db, this.#distribution);
    this.#profiles = new ProfileStore(this.#db);
    this.#workflows = new WorkflowStore(this.#db);
    this.#resolveExport = resolveExport;
  }

  saveLabel(input: unknown): Label {
    return this.#taxonomy.save(input);
  }

  listContentLabels(): ContentLabels[] {
    return this.#taxonomy.content();
  }

  assignContentLabel(input: unknown): ContentLabels {
    return this.#taxonomy.assignContent(input);
  }

  /**
   * Maps a Douyin item's hashtags onto `tag` labels in this same taxonomy. One implementation for
   * every hashing/labelling decision lives in `intake-tags.ts`; the catalog only supplies its own
   * `TaxonomyStore`, so a hand-applied tag and an intake hashtag remain the same label.
   */
  assignDouyinTags(contentId: string, tags: readonly DouyinTag[]): ContentLabels {
    return assignDouyinTags(this.#taxonomy, contentId, tags);
  }

  listChannels(): Channel[] {
    return this.#distribution.channels();
  }

  saveChannel(input: unknown): Channel {
    return this.#distribution.saveChannel(input);
  }

  listLinks(): AffiliateLink[] {
    return this.#distribution.links();
  }

  saveLink(input: unknown): AffiliateLink {
    return this.#distribution.saveLink(input);
  }

  listPosts(query: PostQuery): Page<Post> {
    return this.#posts.list(query);
  }

  async createPost(input: unknown): Promise<Post> {
    const value = object(input, [
      'id',
      'expected_revision',
      'title',
      'body',
      'channel_id',
      'library_id',
      'export_id',
      'link_ids',
      'planned',
    ]);
    const library_id = identifier(value.library_id);
    const export_id = identifier(value.export_id);
    const asset = await this.#resolveExport(library_id, export_id);
    return this.#posts.create(input, {
      library_id,
      link_id: export_id,
      path: asset.path,
      name: asset.name,
      sha256: asset.sha256,
    });
  }

  editPost(input: unknown): Post {
    return this.#posts.edit(input);
  }

  getPost(id: string): Post {
    return this.#posts.get(id);
  }

  listProfiles(): ProcessingProfile[] {
    return this.#profiles.list();
  }

  saveProfile(input: unknown): ProcessingProfile {
    return this.#profiles.save(input);
  }

  getProfile(id: string): ProcessingProfile {
    return this.#profiles.get(id);
  }

  getProfileDocument(id: string): ProfileDocument {
    return this.#profiles.document(id);
  }

  listWorkflows(): Workflow[] {
    return this.#workflows.list();
  }

  getWorkflow(id: string): Workflow {
    return this.#workflows.get(id);
  }

  saveWorkflow(input: unknown, outputDir: string): Workflow {
    return this.#workflows.save(input, outputDir);
  }

  findWorkflowRun(id: string): WorkflowRun | null {
    return this.#workflows.findRun(id);
  }

  prepareWorkflowRun(id: string, workflow: Workflow, inputs: BatchJobInput[]): WorkflowRun {
    return this.#workflows.prepare(id, workflow, inputs);
  }

  admitWorkflowRun(id: string, jobs: string[]): WorkflowRun {
    return this.#workflows.admitted(id, jobs);
  }

  snapshot(executionAvailable: boolean): CatalogSnapshot {
    return {
      revision: this.#db.version,
      channels: this.listChannels(),
      links: this.listLinks(),
      labels: this.#taxonomy.list(),
      content_labels: this.listContentLabels(),
      link_usage: this.#posts.usage(),
      profiles: this.listProfiles(),
      workflows: this.listWorkflows(),
      runs: this.#workflows.runs(),
      execution_available: executionAvailable,
    };
  }

  dependencies(itemId: string) {
    return {
      ...this.#posts.contentDependencies(itemId),
      workflows: this.listWorkflows().filter((workflow) => workflow.item_ids.includes(itemId))
        .length,
    };
  }

  close(): void {
    this.#db.close();
  }
}
