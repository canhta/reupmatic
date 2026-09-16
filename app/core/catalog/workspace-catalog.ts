import { WorkflowStore } from '../automation/workflow-store.js';
import { DistributionStore } from '../distribution/distribution-store.js';
import { PostStore } from '../distribution/post-store.js';
import { ProfileStore } from '../profiles/profile-store.js';
import { TaxonomyStore } from '../taxonomy/taxonomy-store.js';
import { CatalogDatabase } from './catalog-database.js';
import type { CatalogSnapshot } from './catalog-snapshot.js';

export class WorkspaceCatalog {
  readonly db: CatalogDatabase;
  readonly taxonomy: TaxonomyStore;
  readonly distribution: DistributionStore;
  readonly posts: PostStore;
  readonly profiles: ProfileStore;
  readonly workflows: WorkflowStore;

  constructor(filename: string) {
    this.db = new CatalogDatabase(filename);
    this.taxonomy = new TaxonomyStore(this.db);
    this.distribution = new DistributionStore(this.db, this.taxonomy);
    this.posts = new PostStore(this.db, this.distribution);
    this.profiles = new ProfileStore(this.db);
    this.workflows = new WorkflowStore(this.db);
  }

  snapshot(executionAvailable: boolean): CatalogSnapshot {
    return {
      revision: this.db.version,
      channels: this.distribution.channels(),
      links: this.distribution.links(),
      labels: this.taxonomy.list(),
      content_labels: this.taxonomy.content(),
      link_usage: this.posts.usage(),
      profiles: this.profiles.list(),
      workflows: this.workflows.list(),
      runs: this.workflows.runs(),
      execution_available: executionAvailable,
    };
  }

  dependencies(itemId: string) {
    return {
      ...this.posts.contentDependencies(itemId),
      workflows: this.workflows.list().filter((workflow) => workflow.item_ids.includes(itemId))
        .length,
    };
  }

  close(): void {
    this.db.close();
  }
}
