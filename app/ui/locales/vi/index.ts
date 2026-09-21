import { mergeCatalogs } from '../catalog';
import { automationVi } from './automation';
import { batchVi } from './batch';
import { catalogVi } from './catalog';
import { distributionVi } from './distribution';
import { editorVi } from './editor';
import { soundtrackVi } from './editor/audio-tools';
import { compositionVi } from './editor/composition';
import { subtitleStyleVi } from './editor/subtitle-styles';
import { textLayersVi } from './editor/text-layers';
import { textRulesVi } from './editor/text-rules';
import { editingVi } from './editor/video-tools';
import { foldersVi } from './folders';
import { libraryVi } from './library';
import { libraryAssetsVi } from './library/assets';
import { libraryDouyinVi } from './library/douyin';
import { librarySourcesVi } from './library/sources';
import { processingVi } from './processing';
import { profilesVi } from './profiles';
import { projectsVi } from './projects';
import { recoveryVi } from './projects/recovery';
import { settingsVi } from './settings';
import { shellVi } from './shell';
import { speechVi } from './speech';
import { speechProvidersVi } from './speech/providers';
import { synthesisVi } from './speech/synthesis';
import { translationVi } from './speech/translation';
import { visionVi } from './vision';

export const vi = mergeCatalogs(
  automationVi,
  catalogVi,
  distributionVi,
  soundtrackVi,
  compositionVi,
  subtitleStyleVi,
  textLayersVi,
  textRulesVi,
  editingVi,
  libraryAssetsVi,
  libraryDouyinVi,
  librarySourcesVi,
  libraryVi,
  processingVi,
  profilesVi,
  recoveryVi,
  settingsVi,
  speechVi,
  speechProvidersVi,
  synthesisVi,
  translationVi,
  visionVi,
  shellVi,
  foldersVi,
  batchVi,
  projectsVi,
  editorVi,
);
