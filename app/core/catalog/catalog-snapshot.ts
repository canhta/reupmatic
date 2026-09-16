import type { AffiliateLink, Channel } from '../distribution/distribution-types.js';
import type { ProcessingProfile } from '../profiles/profile-types.js';
import type { Label, ContentLabels } from '../taxonomy/taxonomy-types.js';
import type { Workflow, WorkflowRunView } from '../automation/workflow-types.js';
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
