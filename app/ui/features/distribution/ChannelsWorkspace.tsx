import { Tab, TabList } from '@astryxdesign/core/TabList';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AffiliateManager } from './AffiliateManager';
import { ChannelManager } from './ChannelManager';
import { PostBrowser, type PostFilter } from './PostBrowser';

export function ChannelsWorkspace() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('channels');
  const [filter, setFilter] = useState<PostFilter>({ view: 'all' });
  function posts(next: PostFilter) {
    setFilter(next);
    setTab('posts');
  }
  return (
    <div className="business-workspace">
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
      <div
        role="tabpanel"
        id="channels-panel"
        aria-labelledby="channels-tab"
        hidden={tab !== 'channels'}
      >
        <ChannelManager onPosts={(channel_id, view) => posts({ channel_id, view })} />
      </div>
      <div
        role="tabpanel"
        id="affiliate-panel"
        aria-labelledby="affiliate-tab"
        hidden={tab !== 'affiliate'}
      >
        <AffiliateManager onPosts={(link_id) => posts({ link_id, view: 'all' })} />
      </div>
      <div role="tabpanel" id="posts-panel" aria-labelledby="posts-tab" hidden={tab !== 'posts'}>
        <PostBrowser filter={filter} onFilter={setFilter} />
      </div>
    </div>
  );
}
