import { Tab, TabList } from '@astryxdesign/core/TabList';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { registerMenuCommand } from '../../shell/menuCommands';
import { WorkspaceFrame, WorkspaceTabPanel } from '../../shell/WorkspaceFrame';
import { AffiliateManager } from './AffiliateManager';
import { ChannelManager } from './ChannelManager';
import { PostBrowser, type PostFilter } from './PostBrowser';
import { onPostRequested } from './post-intent';

export function ChannelsWorkspace() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('channels');
  const [filter, setFilter] = useState<PostFilter>({ view: 'all' });
  function posts(next: PostFilter) {
    setFilter(next);
    setTab('posts');
  }

  useEffect(() => registerMenuCommand('channels.gotoPosts', () => setTab('posts')), []);
  useEffect(() => onPostRequested(() => setTab('posts')), []);

  return (
    <WorkspaceFrame>
      <TabList value={tab} onChange={setTab} role="tablist" aria-label={t('channels')}>
        <Tab value="channels" label={t('channelsTab')} id="channels-tab" panelId="channels-panel" />
        <Tab
          value="affiliate"
          label={t('affiliateTab')}
          id="affiliate-tab"
          panelId="affiliate-panel"
        />
        <Tab value="posts" label={t('postsTab')} id="posts-tab" panelId="posts-panel" />
      </TabList>
      <WorkspaceTabPanel id="channels-panel" tabId="channels-tab" active={tab === 'channels'}>
        <ChannelManager onPosts={(channel_id, view) => posts({ channel_id, view })} />
      </WorkspaceTabPanel>
      <WorkspaceTabPanel id="affiliate-panel" tabId="affiliate-tab" active={tab === 'affiliate'}>
        <AffiliateManager onPosts={(link_id) => posts({ link_id, view: 'all' })} />
      </WorkspaceTabPanel>
      <WorkspaceTabPanel id="posts-panel" tabId="posts-tab" active={tab === 'posts'}>
        <PostBrowser filter={filter} onFilter={setFilter} />
      </WorkspaceTabPanel>
    </WorkspaceFrame>
  );
}
