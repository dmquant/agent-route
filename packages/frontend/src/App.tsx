import { useState, useEffect, useRef } from 'react';
import { Terminal, Bot, Code, Play, Send, LayoutPanelLeft } from 'lucide-react';

type AgentMode = 'gemini' | 'claude' | 'codex' | 'ollama';

interface LogEntry {
  id: string;
  source: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
}

export default function App() {
  const [activeMode, setActiveMode] = useState<AgentMode>('gemini');
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch Ollama Models Natively from Python
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

    // Placeholder WS connection
    const connect = () => {
      // We will point natively to the Python FastAPI Endpoint
      const socket = new WebSocket('ws://localhost:8000/ws/agent');
      
      socket.onopen = () => {
        if (isUnmounted) {
           socket.close();
           return;
        }
        setIsConnected(true);
        addLog('system', 'Connected to Agent Route Service');
      };
      
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Map Python Pydantic-like events gracefully
          if (data.type === 'node_execution_started') {
            addLog('system', `🏁 Execution sequence initiated for: ${data.nodeId}`);
          } else if (data.type === 'node_execution_log') {
            setLogs(prev => {
              if (prev.length > 0 && prev[prev.length - 1].source === (data.source || 'agent')) {
                // Concatenate streamed tokens into the active bubble
                const newLogs = [...prev];
                newLogs[newLogs.length - 1] = {
                  ...newLogs[newLogs.length - 1],
                  content: newLogs[newLogs.length - 1].content + data.log
                };
                return newLogs;
              } else {
                // Spawn a new bubble
                return [...prev, {
                  id: Math.random().toString(36).substring(7),
                  source: data.source || 'agent',
                  content: data.log,
                  timestamp: Date.now()
                }];
              }
            });
          } else if (data.type === 'node_execution_completed') {
            addLog('system', `✅ Output Complete (Exit: ${data.exitCode})`);
          } else if (data.content) {
            // Fallback for native errors
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
        wsRef.current.onclose = null; // Prevent reconnect loop
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

  const handleSend = () => {
    if (!input.trim()) return;
    
    addLog('user', input);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'execute_node',
        client: activeMode,
        prompt: input,
        model: activeMode === 'ollama' ? selectedModel : undefined,
        nodeId: `ui_node_${Date.now()}`
      }));
    } else {
      addLog('system', 'Error: WebSocket is not connected.');
    }
    
    setInput('');
  };

  const modes = [
    { id: 'gemini', label: 'Gemini CLI', icon: Terminal, description: 'Headless mode execution' },
    { id: 'claude', label: 'Claude Code', icon: Bot, description: 'Remote control session' },
    { id: 'codex', label: 'Codex Server', icon: Code, description: 'OpenAI-compatible server' },
    { id: 'ollama', label: 'Local Ollama', icon: Play, description: 'Native HTTP HTTP stream' }
  ];

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans dark custom-scrollbar">
      {/* Sidebar */}
      <div className="w-64 border-r border-border bg-card/50 backdrop-blur-sm flex flex-col p-4 z-10">
        <div className="flex items-center gap-2 mb-8 px-2">
          <LayoutPanelLeft className="w-6 h-6 text-indigo-500" />
          <h1 className="font-bold tracking-tight text-lg">Agent Route</h1>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Select Engine</h2>
          {modes.map((mode) => {
            const Icon = mode.icon;
            const isActive = activeMode === mode.id;
            return (
              <button
                key={mode.id}
                onClick={() => setActiveMode(mode.id as AgentMode)}
                className={`
                  flex items-start gap-3 p-3 rounded-lg transition-all duration-200 text-left
                  ${isActive 
                    ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                    : 'hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent'}
                `}
              >
                <div className={`p-2 rounded-md ${isActive ? 'bg-indigo-500/20' : 'bg-muted-foreground/10'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className={`font-medium text-sm ${isActive ? 'text-indigo-400' : ''}`}>{mode.label}</div>
                  <div className="text-xs opacity-70 mt-0.5">{mode.description}</div>
                </div>
              </button>
            )
          })}
        </div>

        {activeMode === 'ollama' && ollamaModels.length > 0 && (
          <div className="flex flex-col gap-2 mt-4 px-2 animate-in fade-in slide-in-from-top-2 duration-300">
             <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Select Model</h2>
             <select 
               className="w-full bg-card border border-border rounded-lg p-2 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
               value={selectedModel}
               onChange={(e) => setSelectedModel(e.target.value)}
             >
               {ollamaModels.map(m => (
                 <option key={m} value={m}>{m}</option>
               ))}
             </select>
          </div>
        )}

        <div className="mt-auto pt-6 px-2">
          <div className="flex items-center gap-2 text-sm">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
            <span className="text-muted-foreground">{isConnected ? 'WS Connected' : 'WS Disconnected'}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col relative bg-gradient-to-b from-background to-background/80">
        {/* decorative background element */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />

        {/* Logs Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 font-mono text-sm z-10 w-full max-w-5xl mx-auto">
          {logs.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Terminal className="w-12 h-12 mb-4" />
              <p>No activity yet. Connect to a service to begin.</p>
            </div>
          ) : (
            logs.map((log) => (
              <div 
                key={log.id} 
                className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${log.source === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {log.source !== 'user' && (
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${log.source === 'system' ? 'bg-muted' : 'bg-indigo-500/20 text-indigo-400'}`}>
                    {log.source === 'system' ? <Terminal className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                  </div>
                )}
                <div 
                  className={`
                    p-3 rounded-lg max-w-[80%] whitespace-pre-wrap
                    ${log.source === 'user' ? 'bg-indigo-600 text-white shadow-md' : 
                      log.source === 'system' ? 'text-muted-foreground bg-muted/30 italic border border-border' : 
                      'bg-card border border-border/50 text-card-foreground shadow-sm'}
                  `}
                >
                  {log.content}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-background/80 backdrop-blur-md border-t border-border z-10">
          <div className="max-w-5xl mx-auto flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder={`Send instruction to ${activeMode}...`}
              className="flex-1 bg-card border border-border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all font-mono text-sm"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
