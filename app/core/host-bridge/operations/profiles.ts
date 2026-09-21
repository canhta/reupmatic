import type {
  ProcessingProfile,
  ProfileDocument,
  SaveProfile,
} from '../../profiles/profile-contracts.js';
import { operation } from '../operation-contract.js';
import { requestId, requestRecord } from '../validators.js';

export const profilesOperations = {
  'profile-save': operation<SaveProfile, ProcessingProfile>()({
    rendererMethod: 'profileSave',
    validate: (input) => input as SaveProfile,
  }),
  'profile-read': operation<undefined, ProfileDocument | null>()({
    rendererMethod: 'profileRead',
    validate: () => undefined,
    toRequest: () => undefined,
  }),
  'profile-export': operation<{ id: string }, { name: string } | null>()({
    rendererMethod: 'profileExport',
    validate: (input) => ({ id: requestId(requestRecord(input, ['id']).id) }),
    toRequest: (id: string) => ({ id }),
  }),
} as const;
