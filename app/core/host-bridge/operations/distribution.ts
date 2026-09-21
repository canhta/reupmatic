import type { Page } from '../../catalog/catalog-contracts.js';
import type {
  AffiliateLink,
  Channel,
  CreatePost,
  EditPost,
  ExportChoice,
  Post,
  PostQuery,
  SaveAffiliate,
  SaveChannel,
} from '../../distribution/distribution-contracts.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const distributionOperations = {
  'channel-save': operation<SaveChannel, Channel>()({
    rendererMethod: 'channelSave',
    // Preserves today's behavior: `WorkspaceCatalog.saveChannel` validates its own input deeply.
    validate: (input) => input as SaveChannel,
  }),
  'affiliate-save': operation<SaveAffiliate, AffiliateLink>()({
    rendererMethod: 'affiliateSave',
    validate: (input) => input as SaveAffiliate,
  }),
  'post-list': operation<PostQuery, Page<Post>>()({
    rendererMethod: 'postList',
    validate: (input) => input as PostQuery,
  }),
  'post-export-choices': operation<undefined, ExportChoice[]>()({
    rendererMethod: 'postExportChoices',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'post-create': operation<CreatePost, Post>()({
    rendererMethod: 'postCreate',
    validate: (input) => input as CreatePost,
  }),
  'post-edit': operation<EditPost, Post>()({
    rendererMethod: 'postEdit',
    validate: (input) => input as EditPost,
  }),
  'post-reveal': operation<{ id: string }, { revealed: boolean }>()({
    rendererMethod: 'postReveal',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
} as const;
