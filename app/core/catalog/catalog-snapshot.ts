import type { Workflow, WorkflowRunView } from '../automation/workflow-contracts.js';
import type { AffiliateLink, Channel } from '../distribution/distribution-contracts.js';
import type { ProcessingProfile } from '../profiles/profile-contracts.js';
import type { ContentLabels, Label } from '../taxonomy/taxonomy-contracts.js';
export interface CatalogSnapshot {
  revision: number;
  channels: Channel[];
  links: AffiliateLink[];
  labels: Label[];
  content_labels: ContentLabels[];
  link_usage: Record<string, number>;
  profiles: ProcessingProfile[];
  workflows: Workflow[];
  runs: WorkflowRunView[];
  execution_available: boolean;
}
