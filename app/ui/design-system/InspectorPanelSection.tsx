import { Heading } from '@astryxdesign/core/Heading';
import { Section } from '@astryxdesign/core/Section';
import type { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
}

export function InspectorPanelSection({ title, children }: Props) {
  return (
    <Section
      variant="transparent"
      padding={0}
      className="inspector-panel-section"
      aria-label={title}
    >
      <Heading level={5}>{title}</Heading>
      {children}
    </Section>
  );
}
