import { Layout, LayoutContent } from '@astryxdesign/core/Layout';
import { DouyinConnectionBar } from './DouyinConnectionBar';
import { DouyinSearchPanel } from './DouyinSearchPanel';
import { useDouyinSearch } from './useDouyinSearch';
import { useDouyinSession } from './useDouyinSession';

export function DownloadsWorkspace() {
  const session = useDouyinSession();
  const search = useDouyinSearch();
  const status = session.snapshot?.status ?? 'not_connected';
  const disabled = session.loading || session.busy;
  return (
    <Layout
      height="fill"
      header={<DouyinConnectionBar session={session} />}
      content={
        <LayoutContent padding={0} isScrollable>
          <DouyinSearchPanel
            search={search}
            connected={status === 'connected'}
            disabled={disabled}
            onReconnect={() => session.reconnect()}
            onVerify={() => session.verify()}
          />
        </LayoutContent>
      }
    />
  );
}
