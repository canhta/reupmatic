import { Heading } from '@astryxdesign/core/Heading';
import { Section } from '@astryxdesign/core/Section';
import { VStack } from '@astryxdesign/core/VStack';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

export function InspectorPanelSection({ title, children }: Props) {
  return (
    <Section variant="transparent" padding={0} aria-label={title}>
      <VStack gap={3}>
        <Heading level={5}>{title}</Heading>
        {children}
      </VStack>
    </Section>
  );
}
