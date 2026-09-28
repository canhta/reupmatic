import { Tab, TabList } from '@astryxdesign/core/TabList';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorGenerators } from '../EditorGeneratorContext';
import { SOURCE_LABEL_KEY } from '../EditorSourceContext';
import { ToolDrawer } from '../ToolDrawer';
import { CreateView } from './CreateView';
import { CuesView } from './CuesView';

type View = 'cues' | 'create';

export function CaptionsDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { review } = useEditorGenerators();
  const [view, setView] = useState<View>('cues');
  // A finished draft is reviewed in Create, so its arrival brings that view forward.
  useEffect(() => {
    if (review) setView('create');
  }, [review]);
  return (
    <ToolDrawer
      id="panel-captions"
      tabId="tab-captions"
      label={t(SOURCE_LABEL_KEY.captions)}
      tabs={
        <TabList
          value={view}
          size="sm"
          layout="fill"
          onChange={(next) => setView(next === 'create' ? 'create' : 'cues')}
        >
          <Tab value="cues" label={t('captionsViewCues')} />
          <Tab value="create" label={t('captionsViewCreate')} />
        </TabList>
      }
      onClose={onClose}
    >
      {/* Both views stay mounted so a search, a draft rule or a chosen source survives a switch. */}
      <CuesView isActive={view === 'cues'} />
      <CreateView isActive={view === 'create'} />
    </ToolDrawer>
  );
}
