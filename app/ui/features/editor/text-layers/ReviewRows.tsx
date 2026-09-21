import { List, ListItem } from '@astryxdesign/core/List';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';

export interface ReviewTextBlock {
  key: string;
  /** Field name above the text; omitted when the row is a single value. */
  label?: string;
  text: ReactNode;
  /** The result the user is deciding on; rendered with stronger weight. */
  isPrimary?: boolean;
}

export interface ReviewEntry {
  key: string;
  /** The cue's time range, on its own line above the text blocks. */
  time: string;
  blocks: ReviewTextBlock[];
}

/**
 * The one cue-by-cue review list the generator panels render in the cue column
 * (ED-SUB-P01). The cue column is narrow — default ≈330px, min 260px — so this
 * is a real `List` of one row per cue (dense rows, not Cards): the time range
 * on its own line, then full-width wrapping `Text` blocks. A fixed-column
 * `Table` at this width clipped every long line mid-word, so the comparison
 * text is stacked instead; `After` is the primary block.
 *
 * One component for all three generators: each passes the blocks its own
 * comparison needs (speech before/after, extraction text, translation
 * source/before/generated/after), never a flag that forces unlike shapes
 * together.
 */
export function ReviewRows({ entries, ariaLabel }: { entries: ReviewEntry[]; ariaLabel: string }) {
  return (
    <List aria-label={ariaLabel} density="compact" hasDividers className="review-rows">
      {entries.map((entry) => (
        <ListItem
          key={entry.key}
          label={
            <Text as="span" display="block" type="supporting" size="xsm" hasTabularNumbers>
              {entry.time}
            </Text>
          }
          description={
            <Stack direction="vertical" gap={2}>
              {entry.blocks.map((block) => (
                <Stack direction="vertical" gap={0.5} key={block.key}>
                  {block.label && (
                    <Text as="span" display="block" type="supporting" size="xsm">
                      {block.label}
                    </Text>
                  )}
                  <Text
                    as="span"
                    display="block"
                    type="body"
                    weight={block.isPrimary ? 'medium' : 'normal'}
                    className="rule-comparison-text"
                  >
                    {block.text}
                  </Text>
                </Stack>
              ))}
            </Stack>
          }
        />
      ))}
    </List>
  );
}
