import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export type SourceId = 'media' | 'cues';

export const SOURCE_ORDER: SourceId[] = ['media', 'cues'];

export const SOURCE_LABEL_KEY: Record<SourceId, string> = {
  media: 'projectMedia',
  cues: 'subtitle',
};

export interface EditorSources {
  activeSource: SourceId | null;
  selectSource: (source: SourceId) => void;
  collapseSource: () => void;
}

const EditorSourcesContext = createContext<EditorSources | null>(null);

export function EditorSourcesProvider({ children }: { children: ReactNode }) {
  const [activeSource, setActiveSource] = useState<SourceId | null>('cues');
  const value = useMemo<EditorSources>(
    () => ({
      activeSource,
      selectSource: (source) => setActiveSource((current) => (current === source ? null : source)),
      collapseSource: () => setActiveSource(null),
    }),
    [activeSource],
  );
  return <EditorSourcesContext.Provider value={value}>{children}</EditorSourcesContext.Provider>;
}

export function useEditorSources() {
  const sources = useContext(EditorSourcesContext);
  if (!sources) throw new Error('Editor source components require EditorSourcesProvider');
  return sources;
}
