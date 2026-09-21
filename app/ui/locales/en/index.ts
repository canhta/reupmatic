import { mergeCatalogs } from '../catalog';
import { automationEn } from './automation';
import { batchEn } from './batch';
import { catalogEn } from './catalog';
import { distributionEn } from './distribution';
import { editorEn } from './editor';
import { soundtrackEn } from './editor/audio-tools';
import { compositionEn } from './editor/composition';
import { subtitleStyleEn } from './editor/subtitle-styles';
import { textLayersEn } from './editor/text-layers';
import { textRulesEn } from './editor/text-rules';
import { editingEn } from './editor/video-tools';
import { foldersEn } from './folders';
import { libraryEn } from './library';
import { libraryAssetsEn } from './library/assets';
import { libraryDouyinEn } from './library/douyin';
import { librarySourcesEn } from './library/sources';
import { processingEn } from './processing';
import { profilesEn } from './profiles';
import { projectsEn } from './projects';
import { recoveryEn } from './projects/recovery';
import { settingsEn } from './settings';
import { shellEn } from './shell';
import { speechEn } from './speech';
import { speechProvidersEn } from './speech/providers';
import { synthesisEn } from './speech/synthesis';
import { translationEn } from './speech/translation';
import { visionEn } from './vision';

export const en = mergeCatalogs(
  automationEn,
  catalogEn,
  distributionEn,
  soundtrackEn,
  compositionEn,
  subtitleStyleEn,
  textLayersEn,
  textRulesEn,
  editingEn,
  libraryAssetsEn,
  libraryDouyinEn,
  librarySourcesEn,
  libraryEn,
  processingEn,
  profilesEn,
  recoveryEn,
  settingsEn,
  speechEn,
  speechProvidersEn,
  synthesisEn,
  translationEn,
  visionEn,
  shellEn,
  foldersEn,
  batchEn,
  projectsEn,
  editorEn,
);
