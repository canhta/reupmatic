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
import type {
  NamedProblem,
  TikTokCreatorSettings,
} from '../../distribution/publishing/contracts.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const distributionOperations = {
  'channel-save': operation<SaveChannel, Channel>()({
    rendererMethod: 'channelSave',
    validate: (input) => input as SaveChannel,
  }),
  'channel-connect-start': operation<{ id: string }, { pages: { id: string; name: string }[] }>()({
    rendererMethod: 'channelConnectStart',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'channel-connect-page': operation<{ id: string; page_id: string }, { account_name: string }>()({
    rendererMethod: 'channelConnectPage',
    validate: (input) => {
      const value = requestRecord(input, ['id', 'page_id']);
      return { id: requestId(value.id), page_id: requestId(value.page_id) };
    },
  }),
  'channel-connect': operation<{ id: string }, { account_name: string }>()({
    rendererMethod: 'channelConnect',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'channel-connect-tiktok': operation<{ id: string }, { account_name: string }>()({
    rendererMethod: 'channelConnectTikTok',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'tiktok-creator-info': operation<{ id: string }, TikTokCreatorSettings>()({
    rendererMethod: 'tiktokCreatorInfo',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'channel-disconnect': operation<{ id: string }, { disconnected: true }>()({
    rendererMethod: 'channelDisconnect',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
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
  'post-preflight': operation<{ id: string }, NamedProblem[]>()({
    rendererMethod: 'postPreflight',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'post-publish': operation<{ id: string }, Post>()({
    rendererMethod: 'postPublish',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'post-reconcile': operation<{ id: string }, Post>()({
    rendererMethod: 'postReconcile',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
  'post-open-remote': operation<{ id: string }, { opened: true }>()({
    rendererMethod: 'postOpenRemote',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
} as const;
