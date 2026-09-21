import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import type { ContentEntry } from '../../../core/library/library-contracts';
import { libraryCoverUrl } from '../../../core/library/library-contracts';

export function LibraryCover({ item }: { item: ContentEntry }) {
  const ready = item.cover_state === 'ready' && Boolean(item.cover_path);
  return (
    <div className="library-cover">
      <Thumbnail
        src={ready ? libraryCoverUrl(item.id) : undefined}
        alt=""
        isLoading={item.cover_state === 'pending'}
      />
    </div>
  );
}
