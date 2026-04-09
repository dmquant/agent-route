import { useState, useEffect, useRef } from 'react';
import { Terminal, Bot, Send, PanelLeftClose, PanelLeft, PanelRight, PanelRightClose, FolderOpen } from 'lucide-react';
import { OutputParser } from '../components/OutputParser';
import { SessionPanel } from '../components/SessionPanel';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useSessionState } from '../hooks/useSessionState';


type AgentMode = 'gemini' | 'claude' | 'codex' | 'ollama' | 'mflux';

interface LogEntry {
  id: string;
  source: 'user' | 'agent' | 'system';
  content: string;
  imageB64?: string;
  timestamp: number;
}

export function Chat() {
  const [activeMode, setActiveMode] = useState<AgentMode>('gemini');
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showSessionPanel, setShowSessionPanel] = useState(true);
  const [showWorkspacePanel, setShowWorkspacePanel] = useState(true);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const sessionState = useSessionState();

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

  // ─── Sync messages from session state to log entries ────
  useEffect(() => {
    if (sessionState.messages.length > 0) {
      const converted: LogEntry[] = sessionState.messages.map(m => ({
        id: String(m.id),
        source: m.source,
        content: m.content,
        imageB64: m.image_b64 || undefined,
        timestamp: m.created_at,
      }));
      setLogs(converted);
    } else if (sessionState.activeSessionId) {
      setLogs([]);
    }
  }, [sessionState.messages, sessionState.activeSessionId]);

  useEffect(() => {
    fetch('http://localhost:8000/models/ollama')
      .then(res => res.json())
      .then(data => {
        if (data.models && data.models.length > 0) {
          setOllamaModels(data.models);
          setSelectedModel(data.models[0]);
        }
      })
      .catch(err => console.error("Could not discover Ollama models from backend:", err));
  }, []);

  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;
    let isUnmounted = false;

    const connect = () => {
      const socket = new WebSocket('ws://localhost:8000/ws/agent');
      
      socket.onopen = () => {
        if (isUnmounted) return;
        setIsConnected(true);
        addLog('system', 'Connected to Agent Route Service via Session Router.');
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'node_execution_started') {
            addLog('system', `🏁 Execution sequence initiated for: ${data.nodeId}`);
          } else if (data.type === 'node_execution_log') {
            setLogs(prev => {
              if (prev.length > 0 && prev[prev.length - 1].source === (data.source || 'agent')) {
                const newLogs = [...prev];
                newLogs[newLogs.length - 1] = {
                  ...newLogs[newLogs.length - 1],
                  content: newLogs[newLogs.length - 1].content + data.log
                };
                return newLogs;
              } else {
                return [...prev, {
                  id: Math.random().toString(36).substring(7),
                  source: data.source || 'agent',
                  content: data.log,
                  timestamp: Date.now()
                }];
              }
            });
          } else if (data.type === 'node_execution_image') {
            setLogs(prev => [...prev, {
              id: Math.random().toString(36).substring(7),
              source: 'agent',
              content: '[✨ MFLUX Visual Renderer: Graphic Finalized]',
              imageB64: data.b64,
              timestamp: Date.now()
            }]);
          } else if (data.type === 'node_execution_completed') {
            addLog('system', `✅ Output Complete (Exit: ${data.exitCode})`);
            // Refresh session list to update title/counts
            sessionState.refreshCurrentSession();
            // Refresh workspace panel to show new/changed files
            setWorkspaceKey(k => k + 1);
          } else if (data.content) {
            addLog(data.source || 'agent', data.content);
          }
        } catch (e) {
          addLog('agent', event.data);
        }
      };
      
      socket.onclose = () => {
        setIsConnected(false);
        if (!isUnmounted) {
          addLog('system', 'Disconnected. Reconnecting in 3s...');
          reconnectTimeout = setTimeout(connect, 3000);
        }
      };
      wsRef.current = socket;
    };

    connect();

    return () => {
      isUnmounted = true;
      clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  const addLog = (source: LogEntry['source'], content: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      source,
      content,
      timestamp: Date.now()
    }]);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    // ─── Auto-create session if none is active ─────
    let currentSessionId = sessionState.activeSessionId;
    if (!currentSessionId) {
      const session = await sessionState.createSession({
        projectId: sessionState.activeProjectId,
        agentType: activeMode,
      });
      currentSessionId = session.id;
    }

    addLog('user', input);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'execute_node',
        client: activeMode,
        prompt: input,
        model: activeMode === 'ollama' ? selectedModel : undefined,
        nodeId: `ui_node_${Date.now()}`,
        sessionId: currentSessionId,
      }));
    } else {
      addLog('system', 'Error: WebSocket is not connected.');
    }
    
    setInput('');
  };

  const modes = [
    { id: 'gemini', label: 'Gemini CLI' },
    { id: 'claude', label: 'Claude Code' },
    { id: 'codex', label: 'Codex Server' },
    { id: 'ollama', label: 'Local Ollama' },
    { id: 'mflux', label: 'MFLUX Visual' }
  ];

  // Find active session for header display
  const activeSession = sessionState.sessions.find(s => s.id === sessionState.activeSessionId);
  const activeProject = sessionState.projects.find(p => p.id === activeSession?.project_id);

  return (
    <div className="flex h-full relative z-10 w-full">
      {/* Session Panel */}
      <SessionPanel
        state={sessionState}
        isOpen={showSessionPanel}
        onToggle={() => setShowSessionPanel(!showSessionPanel)}
      />

      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/50 bg-background/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setShowSessionPanel(!showSessionPanel)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
              title={showSessionPanel ? 'Hide Sessions' : 'Show Sessions'}
            >
              {showSessionPanel ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
            </button>

            {/* Active session info */}
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              {activeProject && (
                <div
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium shrink-0"
                  style={{
                    backgroundColor: `${activeProject.color}15`,
                    color: activeProject.color,
                    border: `1px solid ${activeProject.color}30`,
                  }}
                >
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: activeProject.color }} />
                  {activeProject.name}
                </div>
              )}
              {activeSession && (
                <span className="text-sm font-medium text-foreground/60 truncate">
                  {activeSession.title}
                </span>
              )}
              {!activeSession && (
                <span className="text-sm font-medium text-foreground/40 italic">
                  No session selected
                </span>
              )}
            </div>

            <div className="h-5 w-[1px] bg-border mx-2 shrink-0" />
            <div className="flex gap-2 shrink-0">
              {modes.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => setActiveMode(mode.id as AgentMode)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    activeMode === mode.id 
                      ? 'bg-indigo-500 text-white shadow-sm' 
                      : 'bg-card border border-border/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {activeMode === 'ollama' && ollamaModels.length > 0 && (
               <select 
                 className="ml-2 bg-card border border-border rounded-full px-3 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                 value={selectedModel}
                 onChange={(e) => setSelectedModel(e.target.value)}
               >
                 {ollamaModels.map(m => (<option key={m} value={m}>{m}</option>))}
               </select>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-card border border-border/50">
              <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-destructive animate-pulse'}`} />
              {isConnected ? 'Connected' : 'Reconnecting...'}
            </div>
            <button
              onClick={() => setShowWorkspacePanel(!showWorkspacePanel)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={showWorkspacePanel ? 'Hide Workspace' : 'Show Workspace'}
            >
              {showWorkspacePanel
                ? <PanelRightClose className="w-4 h-4" />
                : <div className="relative"><PanelRight className="w-4 h-4" /><FolderOpen className="w-2.5 h-2.5 absolute -bottom-0.5 -right-0.5 text-amber-400" /></div>}
            </button>
          </div>
        </div>

        {/* Logs Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Terminal className="w-12 h-12 mb-4" />
              <p className="text-sm">
                {sessionState.activeSessionId
                  ? 'Session is empty. Send a message to begin.'
                  : 'Select a session or create a new one to begin.'}
              </p>
              {!sessionState.activeSessionId && (
                <button
                  onClick={() => sessionState.createSession({ projectId: sessionState.activeProjectId, agentType: activeMode })}
                  className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors shadow-sm"
                >
                  New Session
                </button>
              )}
            </div>
          ) : (
            logs.map((log) => (
              <div 
                key={log.id} 
                className={`flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full ${log.source === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {log.source !== 'user' && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-1 shadow-sm border ${log.source === 'system' ? 'bg-muted border-border' : 'bg-indigo-900 border-indigo-500 text-indigo-400'}`}>
                    {log.source === 'system' ? <Terminal className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                )}
                <div 
                  className={`
                    p-0 rounded-xl max-w-[85%]
                    ${log.source === 'user' ? 'bg-indigo-600 text-white shadow-md p-4' : 'w-full'}
                  `}
                >
                  {log.source === 'user' ? (
                    log.content
                  ) : (
                    <OutputParser content={log.content} />
                  )}
                  {log.imageB64 && (
                    <div className="mt-4 border border-border/40 rounded-lg overflow-hidden shadow-inner max-w-sm">
                      <img src={`data:image/png;base64,${log.imageB64}`} alt="Rendered Media" className="w-full h-auto object-cover" />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background/80 backdrop-blur-md border-t border-border shrink-0">
          <div className="max-w-5xl mx-auto relative group">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={`Instruct ${activeMode}... (Shift+Enter for context)`}
              className="w-full bg-card border border-border/80 group-focus-within:border-indigo-500/50 rounded-xl pl-4 pr-16 py-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-sans text-sm resize-none shadow-sm min-h-[56px] max-h-48 overflow-y-auto"
              rows={1}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="absolute right-2 bottom-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white p-2.5 rounded-lg transition-transform active:scale-95 shadow-sm"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Workspace Panel (Right Sidebar) */}
      <WorkspacePanel
        sessionId={sessionState.activeSessionId}
        isOpen={showWorkspacePanel}
        onToggle={() => setShowWorkspacePanel(!showWorkspacePanel)}
        key={workspaceKey}
      />
    </div>
  );
}
