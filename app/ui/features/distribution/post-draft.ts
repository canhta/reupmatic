import type { Post, PostOptions } from '../../../core/distribution/distribution-contracts';
import { formatPlannedTime, type PlanDraft } from '../../../core/distribution/post-schedule';

export interface PostDraft {
  id: string;
  expected_revision: number | null;
  title: string;
  body: string;
  channel_id: string;
  export_id: string;
  link_ids: string[];
  options: PostOptions;
  state: 'draft' | 'cancelled';
  plan: PlanDraft;
  saved?: Post;
}

export function postDraft(post?: Post): PostDraft {
  const planned = post?.planned;
  return {
    id: post?.id ?? crypto.randomUUID(),
    expected_revision: post?.revision ?? null,
    title: post?.title ?? '',
    body: post?.body ?? '',
    channel_id: post?.channel.id ?? '',
    export_id: post?.export.link_id ?? '',
    link_ids: post?.links.map((link) => link.id) ?? [],
    options: {
      youtube: post?.options.youtube ?? null,
      tiktok: post?.options.tiktok ?? null,
    },
    state: post?.state ?? 'draft',
    plan: {
      enabled: !!planned,
      local: planned ? formatPlannedTime(planned.instant, planned.timezone) : '',
      timezone: planned?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
      instant: planned ? String(planned.instant) : '',
    },
    ...(post ? { saved: post } : {}),
  };
}
