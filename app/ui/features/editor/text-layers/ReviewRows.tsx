import { List, ListItem } from '@astryxdesign/core/List';
import { Stack } from '@astryxdesign/core/Stack';
import { Text } from '@astryxdesign/core/Text';
import type { ReactNode } from 'react';

export interface ReviewTextBlock {
  key: string;
  label?: string;
  text: ReactNode;
  isPrimary?: boolean;
}

export interface ReviewEntry {
  key: string;
  time: string;
  blocks: ReviewTextBlock[];
}

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
