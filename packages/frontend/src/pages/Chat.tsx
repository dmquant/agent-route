import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Terminal, Bot, Send, PanelLeftClose, PanelLeft,
  PanelRight, PanelRightClose, FolderOpen,
  Loader2, Wifi, WifiOff, Zap, Clock, Radio,
  Users, ChevronDown, ChevronRight, Trophy, AlertCircle, CheckCircle2,
  GitMerge, Play, Link2, GitFork, X,
} from 'lucide-react';
import { OutputParser } from '../components/OutputParser';
import { SessionPanel } from '../components/SessionPanel';
import { WorkspacePanel } from '../components/WorkspacePanel';
import { useSessionState } from '../hooks/useSessionState';
import { useWebSocket } from '../hooks/useWebSocket';


type AgentMode = 'gemini' | 'claude' | 'codex' | 'ollama' | 'mflux';

interface MultiAgentResult {
  agent: string;
  success: boolean;
  exit_code: number;
  output: string;
  isWinner?: boolean;
}

interface LogEntry {
  id: string;
  source: 'user' | 'agent' | 'system';
  content: string;
  imageB64?: string;
  timestamp: number;
  sessionId?: string;
  multiAgentResults?: MultiAgentResult[];
  multiStrategy?: string;
}

interface RunningTask {
  task_id: string;
  session_id: string;
  agent: string;
  prompt: string;
  phase: string;
  elapsed_ms: number;
  output_chunks: number;
  output_bytes: number;
}

// ─── Phase styling ──────────────────────
const PHASE_STYLES: Record<string, { color: string; label: string; animate?: boolean }> = {
  queued:       { color: 'bg-zinc-400',   label: 'Queued' },
  connecting:   { color: 'bg-amber-400',  label: 'Connecting',  animate: true },
  executing:    { color: 'bg-blue-400',   label: 'Executing',   animate: true },
  streaming:    { color: 'bg-emerald-400', label: 'Streaming',  animate: true },
  tool_calling: { color: 'bg-purple-400', label: 'Tool Call',   animate: true },
  finalizing:   { color: 'bg-cyan-400',   label: 'Finalizing',  animate: true },
  completed:    { color: 'bg-green-500',  label: 'Done' },
  failed:       { color: 'bg-red-500',    label: 'Failed' },
};

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

// Agent color mapping for visual distinction
const AGENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  gemini:  { bg: 'bg-blue-500/10',   text: 'text-blue-400',   border: 'border-blue-500/30' },
  claude:  { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  codex:   { bg: 'bg-emerald-500/10',text: 'text-emerald-400',border: 'border-emerald-500/30' },
  ollama:  { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  mflux:   { bg: 'bg-pink-500/10',   text: 'text-pink-400',   border: 'border-pink-500/30' },
};

// ─── Multi-Agent Result Comparison ──────────────────────
function MultiAgentResultView({ results, strategy }: { results: MultiAgentResult[]; strategy?: string }) {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  const successCount = results.filter(r => r.success).length;

  return (
    <div className="w-full mt-2 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card/50 border border-border/30">
        <Users className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-semibold text-foreground/80">
          Multi-Agent Results
        </span>
        <span className="text-[10px] text-muted-foreground">
          {successCount}/{results.length} succeeded
        </span>
        {strategy && (
          <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
            {strategy}
          </span>
        )}
      </div>

      {/* Agent Result Cards */}
      <div className="grid gap-2" style={{ gridTemplateColumns: results.length <= 3 ? `repeat(${results.length}, 1fr)` : 'repeat(2, 1fr)' }}>
        {results.map((result) => {
          const colors = AGENT_COLORS[result.agent] || AGENT_COLORS.gemini;
          const isExpanded = expandedAgent === result.agent;

          return (
            <div
              key={result.agent}
              className={`rounded-lg border transition-all cursor-pointer hover:shadow-md ${
                result.isWinner
                  ? 'border-amber-400/50 bg-amber-500/5 ring-1 ring-amber-400/20'
                  : result.success
                    ? `${colors.border} ${colors.bg}`
                    : 'border-red-500/30 bg-red-500/5'
              }`}
              onClick={() => setExpandedAgent(isExpanded ? null : result.agent)}
            >
              {/* Card Header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <div className={`w-2 h-2 rounded-full ${
                  result.success ? 'bg-green-400' : 'bg-red-400'
                }`} />
                <span className={`text-xs font-semibold ${colors.text}`}>
                  {result.agent}
                </span>
                {result.isWinner && (
                  <Trophy className="w-3 h-3 text-amber-400" />
                )}
                <span className="ml-auto flex items-center gap-1">
                  {result.success
                    ? <CheckCircle2 className="w-3 h-3 text-green-400" />
                    : <AlertCircle className="w-3 h-3 text-red-400" />
                  }
                  <span className="text-[10px] text-muted-foreground font-mono">
                    exit:{result.exit_code}
                  </span>
                </span>
                <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${
                  isExpanded ? 'rotate-90' : ''
                }`} />
              </div>

              {/* Collapsed Preview */}
              {!isExpanded && result.output && (
                <div className="px-3 pb-2">
                  <p className="text-[11px] text-muted-foreground font-mono line-clamp-2 leading-relaxed">
                    {result.output.slice(0, 150)}{result.output.length > 150 ? '...' : ''}
                  </p>
                </div>
              )}

              {/* Expanded Full Output */}
              {isExpanded && result.output && (
                <div className="px-3 pb-3 border-t border-border/20 mt-1">
                  <div className="mt-2 p-2 rounded bg-background/80 max-h-64 overflow-y-auto custom-scrollbar">
                    <pre className="text-[11px] text-foreground/80 font-mono whitespace-pre-wrap break-words leading-relaxed">
                      {result.output}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Execution Status Bar ──────────────────────
function ExecutionStatusBar({ tasks, activeSessionId }: { tasks: RunningTask[]; activeSessionId: string | null }) {
  // Show tasks for the active session first, then others
  const sessionTasks = tasks.filter(t => t.session_id === activeSessionId);
  const otherTasks = tasks.filter(t => t.session_id !== activeSessionId);
  const allActive = [...sessionTasks, ...otherTasks];

  if (allActive.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-border/30 bg-card/20 backdrop-blur-sm overflow-x-auto custom-scrollbar">
      <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse shrink-0" />
      <span className="text-[11px] text-muted-foreground font-medium shrink-0">
        {allActive.length} task{allActive.length > 1 ? 's' : ''} running
      </span>
      <div className="h-3 w-px bg-border/40 shrink-0" />

      {allActive.map(task => {
        const phase = PHASE_STYLES[task.phase] || PHASE_STYLES.executing;
        const isThisSession = task.session_id === activeSessionId;

        return (
          <div
            key={task.task_id}
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-all 
              ${isThisSession
                ? 'bg-indigo-500/8 border-indigo-500/20 text-indigo-300'
                : 'bg-muted/20 border-border/20 text-muted-foreground'
              }`}
          >
            <div className={`w-2 h-2 rounded-full ${phase.color} ${phase.animate ? 'animate-pulse' : ''}`} />
            <span className="font-mono text-[10px] opacity-60">{task.agent}</span>
            <span className="opacity-50">·</span>
            <span>{phase.label}</span>
            <span className="opacity-50">·</span>
            <div className="flex items-center gap-1 opacity-60">
              <Clock className="w-2.5 h-2.5" />
              <span className="font-mono text-[10px]">{formatElapsed(task.elapsed_ms)}</span>
            </div>
            {task.output_bytes > 0 && (
              <>
                <span className="opacity-50">·</span>
                <div className="flex items-center gap-1 opacity-60">
                  <Zap className="w-2.5 h-2.5" />
                  <span className="font-mono text-[10px]">{formatBytes(task.output_bytes)}</span>
                </div>
              </>
            )}
            {!isThisSession && (
              <span className="font-mono text-[9px] px-1 py-0.5 rounded bg-muted/30 opacity-50">
                {task.session_id.slice(0, 6)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}


export function Chat() {
  const [activeMode, setActiveMode] = useState<AgentMode>('gemini');
  const [input, setInput] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showSessionPanel, setShowSessionPanel] = useState(true);
  const [showWorkspacePanel, setShowWorkspacePanel] = useState(true);
  const [workspaceKey, setWorkspaceKey] = useState(0);
  const [runningTasks, setRunningTasks] = useState<RunningTask[]>([]);
  // Multi-agent mode
  const [isMultiAgent, setIsMultiAgent] = useState(false);
  const [selectedAgents, setSelectedAgents] = useState<Set<AgentMode>>(new Set(['gemini']));
  const [multiStrategy, setMultiStrategy] = useState<string>('first_success');
  // Workflow execution in session
  const [workflows, setWorkflows] = useState<{id: string; name: string; steps: any[]}[]>([]);
  const [showWorkflowMenu, setShowWorkflowMenu] = useState(false);
  const [workflowRunning, setWorkflowRunning] = useState<string | null>(null);
  // Context sharing
  const [contextLinks, setContextLinks] = useState<{outgoing: any[]; incoming: any[]}>({outgoing: [], incoming: []});
  const [showLinkPanel, setShowLinkPanel] = useState(false);
  const [linkTargetId, setLinkTargetId] = useState('');

  const logsEndRef = useRef<HTMLDivElement>(null);

  const sessionState = useSessionState();

  const addLog = useCallback((source: LogEntry['source'], content: string) => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substring(7),
      source,
      content,
      timestamp: Date.now(),
    }]);
  }, []);

  // ─── Resilient WebSocket via hook ────
  const sessionStateRef = useRef(sessionState);
  useEffect(() => { sessionStateRef.current = sessionState; }, [sessionState]);

  const handleWsMessage = useCallback((data: any) => {
    const ss = sessionStateRef.current;

    // ─── Running tasks query response ─────
    if (data.type === 'running_tasks') {
      setRunningTasks(data.tasks.filter(
        (t: RunningTask) => !['completed', 'failed'].includes(t.phase)
      ));
      return;
    }

    // ─── Task status updates (from background tasks) ─────
    if (data.type === 'task_status') {
      setRunningTasks(prev => {
        const exists = prev.findIndex(t => t.task_id === data.task_id);
        const isTerminal = ['completed', 'failed'].includes(data.phase);

        if (isTerminal) {
          return prev.filter(t => t.task_id !== data.task_id);
        }

        const updated: RunningTask = {
          task_id: data.task_id,
          session_id: data.session_id,
          agent: data.agent,
          prompt: data.prompt,
          phase: data.phase,
          elapsed_ms: data.elapsed_ms,
          output_chunks: data.output_chunks,
          output_bytes: data.output_bytes,
        };

        if (exists >= 0) {
          const next = [...prev];
          next[exists] = updated;
          return next;
        }
        return [...prev, updated];
      });

      // Show phase transitions as system messages for the active session
      if (data.session_id === ss.activeSessionId) {
        const phase = PHASE_STYLES[data.phase];
        if (phase && !['completed', 'failed'].includes(data.phase)) {
          if (['connecting', 'streaming', 'finalizing'].includes(data.phase)) {
            addLog('system', `⚡ ${data.agent}: ${phase.label} (${formatElapsed(data.elapsed_ms)})`);
          }
        }
      }
      return;
    }

    // ─── Filter events for the active session ─────
    const eventSessionId = data.sessionId;

    if (data.type === 'node_execution_started') {
      if (eventSessionId === ss.activeSessionId) {
        addLog('system', `🏁 Execution initiated for: ${data.agent || data.nodeId}`);
      }
    } else if (data.type === 'node_execution_log') {
      if (eventSessionId === ss.activeSessionId) {
        setLogs(prev => {
          const source = data.source || 'agent';
          const log = data.log || '';

          if (prev.length > 0 && prev[prev.length - 1].source === source) {
            const newLogs = [...prev];
            const lastContent = newLogs[newLogs.length - 1].content;
            newLogs[newLogs.length - 1] = {
              ...newLogs[newLogs.length - 1],
              content: lastContent + '\n' + log,
            };
            return newLogs;
          } else {
            return [...prev, {
              id: Math.random().toString(36).substring(7),
              source,
              content: log,
              timestamp: Date.now(),
              sessionId: eventSessionId,
            }];
          }
        });
      }
    } else if (data.type === 'node_execution_image') {
      if (eventSessionId === ss.activeSessionId) {
        setLogs(prev => [...prev, {
          id: Math.random().toString(36).substring(7),
          source: 'agent',
          content: '[✨ MFLUX Visual Renderer: Graphic Finalized]',
          imageB64: data.b64,
          timestamp: Date.now(),
          sessionId: eventSessionId,
        }]);
      }
    } else if (data.type === 'node_execution_completed') {
      if (eventSessionId === ss.activeSessionId) {
        addLog('system', `✅ Output Complete (Exit: ${data.exitCode})`);
        ss.refreshCurrentSession();
        setWorkspaceKey(k => k + 1);
      }
    // ─── Multi-agent events ─────
    } else if (data.type === 'multi_agent_started') {
      if (data.sessionId === ss.activeSessionId) {
        addLog('system', `🚀 Multi-Agent Fan-Out: ${data.agents?.join(', ')} (strategy: ${data.strategy})`);
      }
    } else if (data.type === 'multi_agent_completed') {
      if (data.sessionId === ss.activeSessionId) {
        const structuredResults: MultiAgentResult[] = (data.all_results || []).map(
          (r: { agent: string; success: boolean; exit_code: number; output?: string }) => ({
            agent: r.agent,
            success: r.success,
            exit_code: r.exit_code,
            output: r.output || '',
            isWinner: data.selected_agent === r.agent,
          })
        );

        setLogs(prev => [...prev, {
          id: Math.random().toString(36).substring(7),
          source: 'system' as const,
          content: `🏁 Multi-Agent Complete (${data.strategy})`,
          timestamp: Date.now(),
          sessionId: data.sessionId,
          multiAgentResults: structuredResults,
          multiStrategy: data.strategy,
        }]);

        ss.refreshCurrentSession();
        setWorkspaceKey(k => k + 1);
      }
    } else if (data.type === 'multi_agent_error') {
      if (data.sessionId === ss.activeSessionId) {
        addLog('system', `❌ Multi-Agent Error: ${data.error}`);
      }
    } else if (data.content) {
      if (!eventSessionId || eventSessionId === ss.activeSessionId) {
        addLog(data.source || 'agent', data.content);
      }
    }
  }, [addLog]);

  const handleWsStateChange = useCallback((wsState: import('../hooks/useWebSocket').ConnectionState) => {
    if (wsState === 'connected') {
      addLog('system', '🔌 Connected to Agent Route Service via Session Router.');
    } else if (wsState === 'disconnected') {
      addLog('system', '⚡ Connection lost. Auto-reconnecting...');
    }
  }, [addLog]);

  const ws = useWebSocket({
    url: 'ws://localhost:8000/ws/agent?api_key=sk_admin_route_2025',
    onMessage: handleWsMessage,
    onStateChange: handleWsStateChange,
    maxReconnectDelay: 30000,
    heartbeatInterval: 20000,
  });

  const isConnected = ws.state === 'connected';

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
        sessionId: sessionState.activeSessionId || undefined,
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

  // Fetch saved workflows
  useEffect(() => {
    fetch('http://localhost:8000/api/workflows')
      .then(r => r.json())
      .then(data => setWorkflows(data.workflows || []))
      .catch(() => {});
  }, []);

  // Fetch context links for current session
  const fetchContextLinks = useCallback(() => {
    if (!sessionState.activeSessionId) {
      setContextLinks({outgoing: [], incoming: []});
      return;
    }
    fetch(`http://localhost:8000/api/sessions/${sessionState.activeSessionId}/context-links`)
      .then(r => r.json())
      .then(data => setContextLinks(data))
      .catch(() => {});
  }, [sessionState.activeSessionId]);

  useEffect(() => {
    fetchContextLinks();
  }, [fetchContextLinks]);

  const linkSession = async () => {
    if (!sessionState.activeSessionId || !linkTargetId.trim()) return;
    await fetch(`http://localhost:8000/api/sessions/${sessionState.activeSessionId}/context-links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_session_id: linkTargetId.trim(), link_type: 'reference' }),
    });
    setLinkTargetId('');
    fetchContextLinks();
    addLog('system', `🔗 Linked session context from ${linkTargetId.slice(0, 8)}…`);
  };

  const unlinkSession = async (linkId: string) => {
    await fetch(`http://localhost:8000/api/context-links/${linkId}`, { method: 'DELETE' });
    fetchContextLinks();
    addLog('system', '🔓 Removed context link');
  };

  const forkCurrentSession = async () => {
    if (!sessionState.activeSessionId) return;
    const res = await fetch(`http://localhost:8000/api/sessions/${sessionState.activeSessionId}/fork`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ copy_messages: 10 }),
    });
    const data = await res.json();
    if (data.id) {
      addLog('system', `🍴 Forked to new session: ${data.title}`);
      await sessionState.loadSessions(sessionState.activeProjectId);
      sessionState.selectSession(data.id);
    }
  };

  // Run a workflow in the current session
  const runWorkflowInSession = async (workflowId: string) => {
    setShowWorkflowMenu(false);
    let currentSessionId = sessionState.activeSessionId;
    if (!currentSessionId) {
      const session = await sessionState.createSession({
        projectId: sessionState.activeProjectId,
        agentType: 'workflow',
      });
      currentSessionId = session.id;
    }
    const wf = workflows.find(w => w.id === workflowId);
    addLog('system', `▶ Starting workflow: ${wf?.name || workflowId} (${wf?.steps?.length || 0} steps)`);
    setWorkflowRunning(workflowId);
    try {
      const res = await fetch(`http://localhost:8000/api/sessions/${currentSessionId}/run-workflow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflow_id: workflowId }),
      });
      const data = await res.json();
      if (!res.ok) {
        addLog('system', `❌ Failed to start workflow: ${data.detail || 'Unknown error'}`);
      }
    } catch (e: any) {
      addLog('system', `❌ Failed to start workflow: ${e.message}`);
    }
    // Don't clear workflowRunning here — it clears when the task completes via WS
    setTimeout(() => setWorkflowRunning(null), 5000);
  };

  const toggleAgent = (agent: AgentMode) => {
    setSelectedAgents(prev => {
      const next = new Set(prev);
      if (next.has(agent)) {
        if (next.size > 1) next.delete(agent);
      } else {
        next.add(agent);
      }
      return next;
    });
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
    
    if (isConnected) {
      if (isMultiAgent && selectedAgents.size > 1) {
        ws.send({
          type: 'multi_agent_run',
          agents: Array.from(selectedAgents),
          prompt: input,
          sessionId: currentSessionId,
          strategy: multiStrategy,
          timeout: 300,
        });
      } else {
        ws.send({
          type: 'execute_node',
          client: activeMode,
          prompt: input,
          model: activeMode === 'ollama' ? selectedModel : undefined,
          nodeId: `ui_node_${Date.now()}`,
          sessionId: currentSessionId,
        });
      }
    } else {
      addLog('system', 'Error: WebSocket is not connected. Reconnecting...');
      ws.forceReconnect();
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

  const activeSession = sessionState.sessions.find(s => s.id === sessionState.activeSessionId);
  const activeProject = sessionState.projects.find(p => p.id === activeSession?.project_id);
  const hasRunningTasksForSession = runningTasks.some(t => t.session_id === sessionState.activeSessionId);

  return (
    <div className="flex h-full relative z-10 w-full">
      {/* Session Panel — pass running session IDs for indicators */}
      <SessionPanel
        state={sessionState}
        isOpen={showSessionPanel}
        onToggle={() => setShowSessionPanel(!showSessionPanel)}
        runningSessions={new Set(runningTasks.map(t => t.session_id))}
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
              {hasRunningTasksForSession && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Running
                </span>
              )}
              {!activeSession && (
                <span className="text-sm font-medium text-foreground/40 italic">
                  No session selected
                </span>
              )}
            </div>

            <div className="h-5 w-[1px] bg-border mx-2 shrink-0" />

            {/* Multi-agent toggle */}
            <button
              onClick={() => setIsMultiAgent(!isMultiAgent)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all shrink-0 ${
                isMultiAgent
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : 'bg-card border border-border/50 text-muted-foreground hover:bg-muted'
              }`}
              title="Toggle multi-agent mode"
            >
              <Users className="w-3 h-3" />
              Multi
            </button>

            <div className="flex gap-1.5 shrink-0">
              {modes.map(mode => (
                <button
                  key={mode.id}
                  onClick={() => {
                    if (isMultiAgent) {
                      toggleAgent(mode.id as AgentMode);
                    } else {
                      setActiveMode(mode.id as AgentMode);
                    }
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                    isMultiAgent
                      ? selectedAgents.has(mode.id as AgentMode)
                        ? 'bg-amber-500/80 text-white shadow-sm ring-1 ring-amber-400/50'
                        : 'bg-card border border-border/50 text-muted-foreground hover:bg-muted'
                      : activeMode === mode.id 
                        ? 'bg-indigo-500 text-white shadow-sm' 
                        : 'bg-card border border-border/50 text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {isMultiAgent && selectedAgents.has(mode.id as AgentMode) && (
                    <span className="mr-1">✓</span>
                  )}
                  {mode.label}
                </button>
              ))}
            </div>

            {/* Strategy selector (multi-agent only) */}
            {isMultiAgent && selectedAgents.size > 1 && (
              <div className="relative shrink-0">
                <select
                  className="appearance-none bg-card border border-amber-500/30 text-amber-300 rounded-full px-3 pr-6 py-1 text-[11px] font-medium focus:outline-none focus:ring-1 focus:ring-amber-500/50 cursor-pointer"
                  value={multiStrategy}
                  onChange={(e) => setMultiStrategy(e.target.value)}
                >
                  <option value="first_success">🏆 First Success</option>
                  <option value="best_effort">⚡ Best Effort</option>
                  <option value="majority_vote">🗳️ Majority Vote</option>
                  <option value="all">📋 All Results</option>
                </select>
                <ChevronDown className="w-3 h-3 absolute right-1.5 top-1/2 -translate-y-1/2 text-amber-400 pointer-events-none" />
              </div>
            )}

            {!isMultiAgent && activeMode === 'ollama' && ollamaModels.length > 0 && (
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
            <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-card border transition-colors ${
              isConnected ? 'border-green-500/30' : ws.state === 'reconnecting' ? 'border-amber-500/30' : 'border-red-500/30'
            }`}>
              {isConnected
                ? <Wifi className="w-3.5 h-3.5 text-green-400" />
                : ws.state === 'reconnecting'
                  ? <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                  : <WifiOff className="w-3.5 h-3.5 text-destructive animate-pulse" />
              }
              <span className={isConnected ? 'text-green-400' : ws.state === 'reconnecting' ? 'text-amber-400' : 'text-red-400'}>
                {isConnected ? 'Connected' : ws.state === 'reconnecting' ? `Retry #${ws.reconnectAttempt}` : 'Disconnected'}
              </span>
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
          {/* Context sharing controls */}
          {sessionState.activeSessionId && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setShowLinkPanel(!showLinkPanel)}
                className={`p-1.5 rounded-md transition-colors ${showLinkPanel ? 'bg-violet-500/20 text-violet-400' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                title="Link sessions for context sharing"
              >
                <Link2 className="w-4 h-4" />
              </button>
              <button
                onClick={forkCurrentSession}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                title="Fork this session"
              >
                <GitFork className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Link Panel */}
        {showLinkPanel && sessionState.activeSessionId && (
          <div className="border-b border-border/30 bg-card/50 px-4 py-3 animate-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-3 max-w-xl">
              <Link2 className="w-4 h-4 text-violet-400 shrink-0" />
              <span className="text-xs font-semibold text-violet-300 shrink-0">Link Session</span>
              <select
                value={linkTargetId}
                onChange={(e) => setLinkTargetId(e.target.value)}
                className="flex-1 bg-card border border-border/60 rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              >
                <option value="">Select a session to link...</option>
                {sessionState.sessions
                  .filter(s => s.id !== sessionState.activeSessionId)
                  .map(s => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({s.agent_type} · {s.message_count || 0} msgs)
                    </option>
                  ))}
              </select>
              <button
                onClick={linkSession}
                disabled={!linkTargetId}
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white transition-colors"
              >
                Link
              </button>
              <button
                onClick={() => setShowLinkPanel(false)}
                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {contextLinks.outgoing.length > 0 && (
              <div className="mt-2 pl-7 flex flex-wrap gap-2">
                {contextLinks.outgoing.map(link => (
                  <div key={link.id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-violet-500/8 border border-violet-500/15 text-[11px]">
                    <span className="text-violet-400/50">
                      {link.link_type === 'fork' ? '🍴' : link.link_type === 'shared_workspace' ? '📁' : '🔗'}
                    </span>
                    <span className="text-violet-300 font-medium">{link.target_title || link.target_session_id?.slice(0, 8)}</span>
                    <span className="text-violet-400/30">·</span>
                    <span className="text-violet-400/50">{link.link_type}</span>
                    <button
                      onClick={() => unlinkSession(link.id)}
                      className="ml-1 text-violet-400/30 hover:text-red-400 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Execution Status Bar — shows all running tasks */}
        <ExecutionStatusBar tasks={runningTasks} activeSessionId={sessionState.activeSessionId} />

        {/* Context Links Bar */}
        {sessionState.activeSessionId && contextLinks.outgoing.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border/30 bg-violet-500/5">
            <Link2 className="w-3 h-3 text-violet-400 shrink-0" />
            <span className="text-[10px] font-semibold text-violet-300 uppercase tracking-wider shrink-0">Shared Context</span>
            <div className="flex items-center gap-1.5 flex-wrap">
              {contextLinks.outgoing.map(link => (
                <div key={link.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/10 border border-violet-500/20 text-[10px]">
                  <span className="text-violet-300 font-medium">{link.target_title || link.target_session_id?.slice(0, 8)}</span>
                  <span className="text-violet-400/50">{link.link_type === 'fork' ? '🍴' : link.link_type === 'shared_workspace' ? '📁' : '🔗'}</span>
                  <button
                    onClick={() => unlinkSession(link.id)}
                    className="ml-0.5 text-violet-400/40 hover:text-red-400 transition-colors"
                    title="Remove link"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

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
                  ) : log.multiAgentResults ? (
                    <div>
                      <OutputParser content={log.content} />
                      <MultiAgentResultView
                        results={log.multiAgentResults}
                        strategy={log.multiStrategy}
                      />
                    </div>
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
              placeholder={isMultiAgent && selectedAgents.size > 1 ? `Fan-out to ${Array.from(selectedAgents).join(', ')}... (${multiStrategy})` : `Instruct ${activeMode}... (Shift+Enter for context)`}
              className="w-full bg-card border border-border/80 group-focus-within:border-indigo-500/50 rounded-xl pl-4 pr-28 py-4 focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all font-sans text-sm resize-none shadow-sm min-h-[56px] max-h-48 overflow-y-auto"
              rows={1}
            />
            {/* Workflow trigger button */}
            <div className="absolute right-14 bottom-2" style={{ zIndex: 10 }}>
              <button
                onClick={() => setShowWorkflowMenu(!showWorkflowMenu)}
                disabled={workflows.length === 0 || !!workflowRunning}
                className={`p-2.5 rounded-lg transition-all shadow-sm ${
                  showWorkflowMenu
                    ? 'bg-emerald-600 text-white'
                    : workflowRunning
                      ? 'bg-emerald-600/30 text-emerald-400 animate-pulse'
                      : 'bg-card border border-border/80 text-muted-foreground hover:bg-emerald-600/20 hover:text-emerald-400 hover:border-emerald-500/40'
                }`}
                title={workflows.length === 0 ? 'No saved workflows' : 'Run a workflow in this session'}
              >
                <GitMerge className="w-4 h-4" />
              </button>
              {showWorkflowMenu && workflows.length > 0 && (
                <div className="absolute bottom-12 right-0 w-72 bg-card border border-border/60 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                  <div className="px-3 py-1.5 border-b border-border/30">
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Run Workflow</span>
                  </div>
                  {workflows.map(wf => (
                    <button
                      key={wf.id}
                      onClick={() => runWorkflowInSession(wf.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/20">
                        <Play className="w-3 h-3 text-emerald-400" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{wf.name}</div>
                        <div className="text-[11px] text-muted-foreground">{wf.steps?.length || 0} steps</div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
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
