import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

/**
 * The Editor's left rail selection (D-63, owner): Media or Subtitles,
 * one panel at a time, the mirror of the tool rail on the right. It lives above
 * the rail and the panel so both agree on the open item, and it is the single
 * place that says whether the left column is open at all.
 */
export type SourceId = 'media' | 'cues';

export const SOURCE_ORDER: SourceId[] = ['media', 'cues'];

export const SOURCE_LABEL_KEY: Record<SourceId, string> = {
  media: 'projectMedia',
  cues: 'subtitle',
};

export interface EditorSources {
  activeSource: SourceId | null;
  /** Opens `source`; re-selecting the open one closes the column to the rail. */
  selectSource: (source: SourceId) => void;
  collapseSource: () => void;
}

const EditorSourcesContext = createContext<EditorSources | null>(null);

export function EditorSourcesProvider({ children }: { children: ReactNode }) {
  // Subtitles is the Editor's working surface, so the column opens on it.
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
