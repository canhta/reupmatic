import { Thumbnail } from '@astryxdesign/core/Thumbnail';
import type { ContentEntry } from '../../../core/library/library-contracts';
import { libraryCoverUrl } from '../../../core/library/library-contracts';

/**
 * The cover cell of a Library row (UI-CM06). The `Thumbnail` owns the
 * square, aspect-ratio-reserved box and the three designed states: the image when `ready`, a
 * skeleton while `pending`, and a neutral silhouette otherwise — never a broken-image glyph and
 * never an empty cell. The row's title cell already names the item, so the cover is decorative
 * (`alt=""`): assistive tech hears the title once, and the name cell stays the unique cell with
 * the file's name.
 */
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
