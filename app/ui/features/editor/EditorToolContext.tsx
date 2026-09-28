import { createContext, type ReactNode, useContext, useMemo, useState } from 'react';

export type ToolId = 'text' | 'audio' | 'video';

export const TOOL_ORDER: ToolId[] = ['text', 'audio', 'video'];

export const TOOL_LABEL_KEY: Record<ToolId, string> = {
  text: 'toolText',
  audio: 'toolAudio',
  video: 'toolVideo',
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
