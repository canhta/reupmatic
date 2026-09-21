import { DouyinConnectionBar } from './DouyinConnectionBar';
import { DouyinSearchPanel } from './DouyinSearchPanel';
import { useDouyinSearch } from './useDouyinSearch';
import { useDouyinSession } from './useDouyinSession';

/**
 * The Downloads tab: the Douyin source bar pinned above one scrolling result column. The session
 * lives here so both read one status and one busy flag rather than two subscriptions, and the
 * source bar stays put while candidates scroll, the same stable-region split the Library and Run
 * history use. The search state is lifted here so a saved channel chip can drive the same search.
 */
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
