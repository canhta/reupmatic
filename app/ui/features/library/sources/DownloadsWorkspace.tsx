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
    <div className="business-workspace downloads-workspace">
      <DouyinConnectionBar session={session} />
      <div className="business-list">
        <DouyinSearchPanel
          search={search}
          connected={status === 'connected'}
          disabled={disabled}
          onReconnect={() => session.reconnect()}
          onVerify={() => session.verify()}
        />
      </div>
    </div>
  );
}
