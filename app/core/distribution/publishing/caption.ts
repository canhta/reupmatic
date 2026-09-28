import type { Post } from '../distribution-contracts.js';
import type { DestinationCapabilities } from './contracts.js';

export interface Caption {
  title: string;
  body: string;
  clipped: boolean;
}

// Post body first, then one line per affiliate link; clipped only where a platform limit forces it.
export function composeCaption(
  post: Pick<Post, 'title' | 'body' | 'links'>,
  capabilities: DestinationCapabilities,
): Caption {
  const lines = [post.body.trim(), ...post.links.map((link) => link.url.trim())].filter(Boolean);
  let body = lines.join('\n');
  let clipped = false;
  if (body.length > capabilities.caption.body_max) {
    body = body.slice(0, capabilities.caption.body_max);
    clipped = true;
  }
  let title = post.title;
  if (capabilities.caption.title_max !== null && title.length > capabilities.caption.title_max) {
    title = title.slice(0, capabilities.caption.title_max);
    clipped = true;
  }
  return { title, body, clipped };
}
