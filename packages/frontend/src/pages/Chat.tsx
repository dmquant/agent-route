import { useState, useEffect, useRef } from 'react';
import { Terminal, Bot, Code, Play, Send, Image as ImageIcon } from 'lucide-react';
import { OutputParser } from '../components/OutputParser';

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
  const wsRef = useRef<WebSocket | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [logs]);

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
        addLog('system', 'Connected to Agent Route Service via Workspace Router.');
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
    { id: 'gemini', label: 'Gemini CLI' },
    { id: 'claude', label: 'Claude Code' },
    { id: 'codex', label: 'Codex Server' },
    { id: 'ollama', label: 'Local Ollama' },
    { id: 'mflux', label: 'MFLUX Visual' }
  ];

  return (
    <div className="flex flex-col h-full relative z-10 w-full">
      {/* Top Header */}
      <div className="flex items-center justify-between p-4 border-b border-border/50 bg-background/50 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Interactive Workspace</h2>
          <div className="h-5 w-[1px] bg-border mx-2" />
          <div className="flex gap-2">
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
        <div className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-card border border-border/50">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-destructive animate-pulse'}`} />
          {isConnected ? 'Connected' : 'Reconnecting...'}
        </div>
      </div>

      {/* Logs Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
        {logs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
            <Terminal className="w-12 h-12 mb-4" />
            <p>Ready for autonomous orchestration. Select engine and send instruction.</p>
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
  );
}
