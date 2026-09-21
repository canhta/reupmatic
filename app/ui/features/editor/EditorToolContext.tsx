import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

/**
 * The Editor's one tool selection (ED-P01, D-63): the seven fixed rail items and
 * which panel, if any, is open. It lives above the cue region and tool panel so
 * the rail and the panel agree on the open item.
 */
export type ToolId = 'transcribe' | 'translate' | 'voice' | 'style' | 'clean-up' | 'audio' | 'edit';

/** Rail order (ED-P01): five core items, then Audio and Edit after the divider. */
export const TOOL_ORDER: ToolId[] = [
  'transcribe',
  'translate',
  'voice',
  'style',
  'clean-up',
  'audio',
  'edit',
];

export const TOOL_LABEL_KEY: Record<ToolId, string> = {
  transcribe: 'toolTranscribe',
  translate: 'toolTranslate',
  voice: 'toolVoice',
  style: 'toolStyle',
  'clean-up': 'toolCleanUp',
  audio: 'toolAudio',
  edit: 'toolEdit',
};

export interface EditorTools {
  activeTool: ToolId | null;
  /** Opens `tool`; re-selecting the active tool collapses the panel. */
  selectTool: (tool: ToolId) => void;
  collapseTool: () => void;
}

const EditorToolsContext = createContext<EditorTools | null>(null);

export function EditorToolsProvider({ children }: { children: ReactNode }) {
  const [activeTool, setActiveTool] = useState<ToolId | null>(null);
  const value = useMemo<EditorTools>(
    () => ({
      activeTool,
      selectTool: (tool) => setActiveTool((current) => (current === tool ? null : tool)),
      collapseTool: () => setActiveTool(null),
    }),
    [activeTool],
  );
  return <EditorToolsContext.Provider value={value}>{children}</EditorToolsContext.Provider>;
}

export function useEditorTools() {
  const tools = useContext(EditorToolsContext);
  if (!tools) throw new Error('Editor tool components require EditorToolsProvider');
  return tools;
}
