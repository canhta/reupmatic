import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export type ToolId = 'transcribe' | 'translate' | 'voice' | 'style' | 'clean-up' | 'audio' | 'edit';

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
