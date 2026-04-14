import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Brain, Activity, Clock, Zap, RefreshCw,
  Play, Pause, RotateCcw, AlertTriangle, CheckCircle2,
  XCircle, ArrowRight, Database, Gauge, Eye,
  MessageSquare, Terminal, TrendingUp,
  Wrench, Globe, PenTool, FileText,
  FolderOpen,
  Radio, ExternalLink, Network, Hash, Workflow,
} from 'lucide-react';

const API = 'http://localhost:8000';

// ─── Types ──────────────────────
interface SessionEvent {
  id: number;
  session_id: string;
  event_type: string;
  agent: string | null;
  content: string;
  metadata: Record<string, any>;
  timestamp: number;
}

interface ContextStats {
  session_id: string;
  total_events: number;
  estimated_tokens: number;
  context_budget: number;
  utilization: number;
  needs_compaction: boolean;
  strategy_if_built: string;
}

interface BrainStatus {
  session_id: string;
  brain_state: string;
  last_agent: string;
  event_summary: {
    total_events: number;
    event_types: Record<string, number>;
    duration_ms: number;
  };
  token_usage: {
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
  };
  context: ContextStats;
  harness: Record<string, any>;
}

interface SessionInfo {
  id: string;
  title: string;
  agent_type: string;
  created_at: string;
}

// ─── Event Type Styling ──────────────────────
const EVENT_STYLES: Record<string, { color: string; icon: any; label: string }> = {
  'message.user':       { color: 'text-blue-400',    icon: MessageSquare, label: 'User' },
  'message.agent':      { color: 'text-emerald-400', icon: Terminal,      label: 'Agent' },
  'tool.call':          { color: 'text-amber-400',   icon: Wrench,        label: 'Tool Call' },
  'tool.result':        { color: 'text-green-400',   icon: CheckCircle2,  label: 'Tool Result' },
  'tool.error':         { color: 'text-red-400',     icon: XCircle,       label: 'Tool Error' },
  'agent.selected':     { color: 'text-indigo-400',  icon: Brain,         label: 'Selected' },
  'agent.delegated':    { color: 'text-purple-400',  icon: ArrowRight,    label: 'Delegated' },
  'agent.joined':       { color: 'text-purple-300',  icon: CheckCircle2,  label: 'Joined' },
  'session.created':    { color: 'text-sky-400',     icon: Play,          label: 'Created' },
  'session.resumed':    { color: 'text-sky-300',     icon: RotateCcw,     label: 'Resumed' },
  'session.paused':     { color: 'text-zinc-400',    icon: Pause,         label: 'Paused' },
  'context.compact':    { color: 'text-orange-400',  icon: Database,      label: 'Compact' },
  'context.checkpoint': { color: 'text-cyan-400',    icon: Database,      label: 'Checkpoint' },
  'file.created':       { color: 'text-amber-400',   icon: FileText,      label: 'File Created' },
  'file.modified':      { color: 'text-amber-300',   icon: PenTool,       label: 'File Modified' },
  'sandbox.provisioned':{ color: 'text-teal-400',    icon: FolderOpen,    label: 'Sandbox' },
  'metric':             { color: 'text-pink-400',    icon: TrendingUp,    label: 'Metric' },
  'error':              { color: 'text-red-500',     icon: AlertTriangle, label: 'Error' },
};

function getEventStyle(type: string) {
  return EVENT_STYLES[type] || { color: 'text-zinc-400', icon: Activity, label: type.split('.').pop() || type };
}

// ─── Event Timeline Item ──────────────────────
function EventItem({ event }: { event: SessionEvent }) {
  const [expanded, setExpanded] = useState(false);
  const style = getEventStyle(event.event_type);
  const Icon = style.icon;
  const ts = new Date(event.timestamp).toLocaleTimeString();

  // Parse tool/activity metadata for rich display
  const meta = event.metadata || {};
  const hasRichMeta = meta.hand_type || meta.tool || meta.command || meta.file || meta.workspace;

  return (
    <div
      className="group flex gap-3 px-3 py-2 rounded-lg hover:bg-muted/30 transition-colors cursor-pointer"
      onClick={() => setExpanded(!expanded)}
    >
      {/* Timeline dot & line */}
      <div className="flex flex-col items-center pt-1">
        <div className={`w-2 h-2 rounded-full ring-2 ring-offset-2 ring-offset-background ${style.color.replace('text-', 'bg-')} ${style.color.replace('text-', 'ring-')}`} />
        <div className="w-px flex-1 bg-border/30 mt-1" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs">
          <Icon className={`w-3.5 h-3.5 ${style.color}`} />
          <span className={`font-medium ${style.color}`}>{style.label}</span>
          {event.agent && (
            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">
              {event.agent}
            </span>
          )}
          {/* Show tool type badge */}
          {meta.hand_type && (
            <span className="px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[9px] font-medium uppercase tracking-wider border border-violet-500/20">
              {meta.hand_type}
            </span>
          )}
          <span className="text-muted-foreground/50 ml-auto font-mono text-[10px]">
            #{event.id} · {ts}
          </span>
        </div>
        {event.content && (
          <p className={`text-xs text-muted-foreground mt-1 ${expanded ? '' : 'line-clamp-2'}`}>
            {event.content}
          </p>
        )}

        {/* Rich metadata display */}
        {expanded && hasRichMeta && (
          <div className="mt-2 space-y-1.5">
            {meta.workspace && (
              <div className="flex items-center gap-2 text-[10px]">
                <FolderOpen className="w-3 h-3 text-teal-400" />
                <span className="text-muted-foreground/50 w-14">Workspace</span>
                <span className="font-mono text-teal-300/70">{meta.workspace}</span>
              </div>
            )}
            {meta.context_tokens > 0 && (
              <div className="flex items-center gap-2 text-[10px]">
                <Database className="w-3 h-3 text-blue-400" />
                <span className="text-muted-foreground/50 w-14">Context</span>
                <span className="font-mono text-blue-300/70">{meta.context_tokens?.toLocaleString()} tokens</span>
              </div>
            )}
            {meta.strategy && (
              <div className="flex items-center gap-2 text-[10px]">
                <Gauge className="w-3 h-3 text-orange-400" />
                <span className="text-muted-foreground/50 w-14">Strategy</span>
                <span className="font-mono text-orange-300/70">{meta.strategy}</span>
              </div>
            )}
            {meta.exception && (
              <div className="flex items-center gap-2 text-[10px]">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-muted-foreground/50 w-14">Exception</span>
                <span className="font-mono text-red-300/70">{meta.exception}</span>
              </div>
            )}
          </div>
        )}

        {expanded && Object.keys(event.metadata).length > 0 && !hasRichMeta && (
          <pre className="text-[10px] text-muted-foreground/60 mt-1 bg-muted/20 rounded p-2 overflow-x-auto font-mono">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

// ─── Context Gauge ──────────────────────
function ContextGauge({ stats }: { stats: ContextStats }) {
  const pct = Math.min(stats.utilization * 100, 100);
  const color = pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-amber-500' : 'bg-emerald-500';
  const textColor = pct > 80 ? 'text-red-400' : pct > 50 ? 'text-amber-400' : 'text-emerald-400';

  return (
    <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-5 h-5 text-indigo-400" />
        <h3 className="font-semibold">Context Window</h3>
      </div>

      {/* Gauge bar */}
      <div className="relative h-3 bg-muted/50 rounded-full overflow-hidden mb-3">
        <div
          className={`absolute inset-y-0 left-0 ${color} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground">Utilization</span>
          <div className={`font-bold text-lg ${textColor}`}>{(pct).toFixed(1)}%</div>
        </div>
        <div>
          <span className="text-muted-foreground">Strategy</span>
          <div className="font-medium text-foreground/80 capitalize">
            {stats.strategy_if_built.replace('_', ' ')}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Tokens</span>
          <div className="font-mono text-foreground/70">
            {stats.estimated_tokens.toLocaleString()} / {stats.context_budget.toLocaleString()}
          </div>
        </div>
        <div>
          <span className="text-muted-foreground">Events</span>
          <div className="font-mono text-foreground/70">{stats.total_events}</div>
        </div>
      </div>

      {stats.needs_compaction && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          <AlertTriangle className="w-3.5 h-3.5" />
          Context needs compaction
        </div>
      )}
    </div>
  );
}

// ─── Harness Config Card ──────────────────────
function HarnessCard({ config }: { config: Record<string, any> }) {
  return (
    <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Activity className="w-5 h-5 text-purple-400" />
        <h3 className="font-semibold">Harness Config</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
          {config.agent}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {[
          { label: 'Max Context', value: `${(config.max_context_tokens || 0).toLocaleString()} tokens` },
          { label: 'Compact', value: config.auto_compact ? `at ${(config.compact_threshold * 100)}%` : 'Off' },
          { label: 'Strategy', value: config.compact_strategy || 'N/A' },
          { label: 'Timeout', value: `${config.timeout_seconds}s` },
          { label: 'Retry', value: config.retry_on_failure ? `up to ${config.max_retries}x` : 'Off' },
          { label: 'Skills', value: config.skills?.length > 0 ? config.skills.join(', ') : 'None' },
        ].map(item => (
          <div key={item.label} className="flex justify-between py-1.5 border-b border-border/20">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="font-medium text-foreground/80">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Activity Summary Card ──────────────────────
function ActivitySummary({ events }: { events: SessionEvent[] }) {
  // Extract tool call and activity events
  const toolEvents = events.filter(e => 
    ['tool.call', 'tool.result', 'tool.error', 'file.created', 'file.modified'].includes(e.event_type)
  );
  
  // Count by type
  const toolCalls = events.filter(e => e.event_type === 'tool.call').length;
  const toolResults = events.filter(e => e.event_type === 'tool.result').length;
  const toolErrors = events.filter(e => e.event_type === 'tool.error').length;
  const fileOps = events.filter(e => e.event_type.startsWith('file.')).length;
  const contextOps = events.filter(e => e.event_type.startsWith('context.')).length;
  const agentSwitches = events.filter(e => e.event_type.startsWith('agent.')).length;

  // Get unique tools used from metadata
  const toolsUsed = new Set<string>();
  for (const e of events) {
    if (e.metadata?.hand_type) toolsUsed.add(e.metadata.hand_type);
    if (e.metadata?.tool) toolsUsed.add(e.metadata.tool);
  }

  const statItems = [
    { label: 'Tool Calls', value: toolCalls, color: 'text-amber-400', icon: Wrench, bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
    { label: 'Results', value: toolResults, color: 'text-emerald-400', icon: CheckCircle2, bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
    { label: 'Errors', value: toolErrors, color: 'text-red-400', icon: XCircle, bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
    { label: 'File Ops', value: fileOps, color: 'text-blue-400', icon: FileText, bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
    { label: 'Context', value: contextOps, color: 'text-orange-400', icon: Database, bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
    { label: 'Agents', value: agentSwitches, color: 'text-purple-400', icon: Brain, bgColor: 'bg-purple-500/10', borderColor: 'border-purple-500/20' },
  ];

  return (
    <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Wrench className="w-5 h-5 text-amber-400" />
        <h3 className="font-semibold">Activity Summary</h3>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {statItems.map(item => (
          <div key={item.label} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg ${item.bgColor} border ${item.borderColor}`}>
            <item.icon className={`w-3.5 h-3.5 ${item.color} shrink-0`} />
            <div className="min-w-0">
              <div className={`text-sm font-bold ${item.color}`}>{item.value}</div>
              <div className="text-[9px] text-muted-foreground/50 uppercase tracking-wider">{item.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tools used */}
      {toolsUsed.size > 0 && (
        <div>
          <div className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider mb-1.5">Tools Used</div>
          <div className="flex gap-1 flex-wrap">
            {[...toolsUsed].map(tool => (
              <span key={tool} className="text-[10px] px-2 py-0.5 rounded-full bg-muted/50 text-foreground/60 border border-border/30 font-mono">
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recent tool activity timeline */}
      {toolEvents.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-wider mb-2">Recent Tool Activity</div>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {toolEvents.slice(-8).map(event => {
              const s = getEventStyle(event.event_type);
              const Icon = s.icon;
              const ts = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              return (
                <div key={event.id} className="flex items-center gap-2 text-[10px] py-1 px-2 rounded hover:bg-muted/20 transition-colors">
                  <Icon className={`w-3 h-3 ${s.color} shrink-0`} />
                  <span className={`font-medium ${s.color} w-16 shrink-0`}>{s.label}</span>
                  <span className="text-muted-foreground/60 font-mono truncate flex-1">{event.content.slice(0, 80)}</span>
                  <span className="text-muted-foreground/30 font-mono shrink-0">{ts}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Types for Activity Desk ──────────────────────
interface APICallRecord {
  id: number;
  request_id: string;
  method: string;
  path: string;
  query_params: string;
  status_code: number;
  duration_ms: number;
  client_ip: string;
  user_agent: string;
  request_body_preview: string;
  session_id: string;
  agent: string;
  source: string;
  category: string;
  created_at: number;
}

interface ActivityStats {
  total_calls: number;
  period_hours: number;
  by_category: Record<string, number>;
  by_method: Record<string, number>;
  by_source: Record<string, number>;
  by_status: Record<string, number>;
  avg_duration_ms: number;
  execution_calls: number;
  unique_sessions: number;
  top_paths?: { path: string; count: number }[];
}

interface UnifiedFeedItem {
  type: 'api_call' | 'running_task' | 'workflow_run';
  timestamp: number;
  method?: string;
  path?: string;
  status_code?: number;
  duration_ms?: number;
  agent?: string;
  session_id?: string;
  source?: string;
  category?: string;
  request_id?: string;
  task_id?: string;
  phase?: string;
  elapsed_ms?: number;
  prompt?: string;
  run_id?: string;
  workflow_id?: string;
  status?: string;
}

// ─── Source Badge ──────────────────────
function SourceBadge({ source }: { source: string }) {
  if (source === 'api') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 text-[9px] font-semibold uppercase border border-orange-500/20">
        <ExternalLink className="w-2.5 h-2.5" />
        API
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-sky-500/10 text-sky-400 text-[9px] font-semibold uppercase border border-sky-500/20">
      <Globe className="w-2.5 h-2.5" />
      UI
    </span>
  );
}

// ─── Method Badge ──────────────────────
function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    POST: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    PUT: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    DELETE: 'text-red-400 bg-red-500/10 border-red-500/20',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono border ${colors[method] || 'text-zinc-400 bg-zinc-500/10 border-zinc-500/20'}`}>
      {method}
    </span>
  );
}

// ─── Status Badge ──────────────────────
function StatusBadge({ code }: { code: number }) {
  const color = code < 300 ? 'text-emerald-400' : code < 400 ? 'text-amber-400' : 'text-red-400';
  return <span className={`font-mono text-[10px] font-medium ${color}`}>{code}</span>;
}

// ─── Activity Desk Component ──────────────────────
function ActivityDesk() {
  const [feed, setFeed] = useState<UnifiedFeedItem[]>([]);
  const [stats, setStats] = useState<ActivityStats | null>(null);
  const [calls, setCalls] = useState<APICallRecord[]>([]);
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const refreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const sourceParam = sourceFilter !== 'all' ? `&source=${sourceFilter}` : '';
      const categoryParam = categoryFilter !== 'all' ? `&category=${categoryFilter}` : '';

      const [feedRes, statsRes, callsRes] = await Promise.all([
        fetch(`${API}/api/activity/feed?limit=50${sourceParam}`),
        fetch(`${API}/api/activity/stats?hours=24`),
        fetch(`${API}/api/activity/calls?limit=100${categoryParam}${sourceParam}`),
      ]);

      const feedData = await feedRes.json();
      const statsData = await statsRes.json();
      const callsData = await callsRes.json();

      setFeed(feedData.feed || []);
      setStats(statsData);
      setCalls(callsData.calls || []);
    } catch (e) {
      console.error('Activity fetch error:', e);
    }
  }, [sourceFilter, categoryFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (autoRefresh) {
      refreshRef.current = setInterval(fetchData, 5000);
    }
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
    };
  }, [autoRefresh, fetchData]);

  const categoryButtons = [
    { key: 'all', label: 'All' },
    { key: 'execution', label: 'Execution' },
    { key: 'brain', label: 'Brain' },
    { key: 'workflow', label: 'Workflow' },
    { key: 'session_mutation', label: 'Session' },
    { key: 'context', label: 'Context' },
    { key: 'file', label: 'Files' },
    { key: 'report', label: 'Reports' },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-6 gap-3">
          {[
            { label: 'Total Calls (24h)', value: stats.total_calls, color: 'text-indigo-400', icon: Hash },
            { label: 'Execution Calls', value: stats.execution_calls, color: 'text-blue-400', icon: Zap },
            { label: 'Avg Duration', value: `${stats.avg_duration_ms}ms`, color: 'text-amber-400', icon: Clock },
            { label: 'Unique Sessions', value: stats.unique_sessions, color: 'text-emerald-400', icon: Network },
            { label: 'API (Direct)', value: stats.by_source?.api || 0, color: 'text-orange-400', icon: ExternalLink },
            { label: 'UI (Frontend)', value: stats.by_source?.ui || 0, color: 'text-sky-400', icon: Globe },
          ].map(stat => (
            <div key={stat.label} className="bg-card/30 backdrop-blur-md border border-border/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <stat.icon className="w-3 h-3" />
                {stat.label}
              </div>
              <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters Row */}
      <div className="flex items-center gap-3">
        {/* Source filter */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground/60 uppercase font-medium">Source:</span>
          {[{ key: 'all', label: 'All' }, { key: 'api', label: 'API (Direct)' }, { key: 'ui', label: 'UI' }].map(btn => (
            <button
              key={btn.key}
              onClick={() => setSourceFilter(btn.key)}
              className={`text-[10px] px-2 py-1 rounded-full transition-all border ${
                sourceFilter === btn.key
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                  : 'bg-muted/30 border-border/20 text-muted-foreground/60 hover:text-muted-foreground'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1.5 ml-4">
          <span className="text-[10px] text-muted-foreground/60 uppercase font-medium">Category:</span>
          {categoryButtons.map(btn => (
            <button
              key={btn.key}
              onClick={() => setCategoryFilter(btn.key)}
              className={`text-[10px] px-2 py-1 rounded-full transition-all border ${
                categoryFilter === btn.key
                  ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                  : 'bg-muted/30 border-border/20 text-muted-foreground/60 hover:text-muted-foreground'
              }`}
            >
              {btn.label}
            </button>
          ))}

        {/* Auto-refresh toggle */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg transition-all border ${
              autoRefresh
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-muted/30 border-border/20 text-muted-foreground'
            }`}
          >
            <Radio className={`w-3 h-3 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'Live' : 'Paused'}
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg bg-muted/30 border border-border/20 text-muted-foreground hover:text-foreground transition-all"
          >
            <RefreshCw className="w-3 h-3" />
            Refresh
          </button>
        </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-3 gap-6">
        {/* Call Log (2 cols) */}
        <div className="col-span-2 bg-card/50 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              <h3 className="font-semibold">API Call Log</h3>
              <span className="text-xs text-muted-foreground">({calls.length} recent)</span>
            </div>
          </div>

          <div className="max-h-[600px] overflow-y-auto">
            {calls.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Activity className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-sm">No API calls recorded yet</p>
                <p className="text-xs mt-1">Start making requests to see them here</p>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/20 text-muted-foreground/60">
                    <th className="px-3 py-2 text-left font-medium">Source</th>
                    <th className="px-3 py-2 text-left font-medium">Method</th>
                    <th className="px-3 py-2 text-left font-medium">Path</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                    <th className="px-3 py-2 text-left font-medium">Duration</th>
                    <th className="px-3 py-2 text-left font-medium">Agent</th>
                    <th className="px-3 py-2 text-left font-medium">Session</th>
                    <th className="px-3 py-2 text-left font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {calls.map(call => {
                    const ts = new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                    return (
                      <tr key={call.id} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                        <td className="px-3 py-2"><SourceBadge source={call.source} /></td>
                        <td className="px-3 py-2"><MethodBadge method={call.method} /></td>
                        <td className="px-3 py-2 font-mono text-foreground/80 max-w-[200px] truncate" title={call.path}>{call.path}</td>
                        <td className="px-3 py-2"><StatusBadge code={call.status_code} /></td>
                        <td className="px-3 py-2 font-mono text-muted-foreground">{call.duration_ms.toFixed(0)}ms</td>
                        <td className="px-3 py-2">
                          {call.agent ? (
                            <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] font-mono">{call.agent}</span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {call.session_id ? (
                            <span className="font-mono text-[10px] text-indigo-400/70">{call.session_id.slice(0, 8)}…</span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-muted-foreground/50">{ts}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right Sidebar: Live Feed + Category Breakdown */}
        <div className="space-y-6">
          {/* Unified Live Feed */}
          <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-border/30">
              <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
              <h3 className="font-semibold">Live Feed</h3>
            </div>
            <div className="max-h-[250px] overflow-y-auto p-3 space-y-1.5">
              {feed.slice(0, 20).map((item, i) => {
                const ts = item.timestamp ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
                if (item.type === 'api_call') {
                  return (
                    <div key={`api-${i}`} className="flex items-center gap-2 text-[10px] py-1.5 px-2 rounded-lg hover:bg-muted/20 transition-colors">
                      <SourceBadge source={item.source || 'api'} />
                      <MethodBadge method={item.method || 'GET'} />
                      <span className="font-mono text-foreground/70 truncate flex-1" title={item.path}>{item.path}</span>
                      <StatusBadge code={item.status_code || 200} />
                      <span className="text-muted-foreground/30 font-mono shrink-0">{ts}</span>
                    </div>
                  );
                }
                if (item.type === 'running_task') {
                  return (
                    <div key={`task-${i}`} className="flex items-center gap-2 text-[10px] py-1.5 px-2 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
                      <span className="font-medium text-blue-400 uppercase">RUNNING</span>
                      <span className="font-mono text-foreground/60 truncate flex-1">{item.agent} · {item.prompt}</span>
                      <span className="text-muted-foreground/30 font-mono shrink-0">{((item.elapsed_ms || 0) / 1000).toFixed(1)}s</span>
                    </div>
                  );
                }
                if (item.type === 'workflow_run') {
                  return (
                    <div key={`wf-${i}`} className="flex items-center gap-2 text-[10px] py-1.5 px-2 rounded-lg hover:bg-muted/20 transition-colors">
                      <Workflow className="w-3 h-3 text-purple-400 shrink-0" />
                      <span className="font-medium text-purple-400">Workflow</span>
                      <span className="font-mono text-foreground/60 truncate flex-1">{item.run_id?.slice(0, 8)}</span>
                      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${
                        item.status === 'completed' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                        : item.status === 'running' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                        : 'text-red-400 bg-red-500/10 border-red-500/20'
                      }`}>{item.status}</span>
                      <span className="text-muted-foreground/30 font-mono shrink-0">{ts}</span>
                    </div>
                  );
                }
                return null;
              })}
            </div>
          </div>

          {/* Category Breakdown */}
          {stats && (
            <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold">By Category</h3>
              </div>
              <div className="space-y-2">
                {Object.entries(stats.by_category)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, count]) => {
                    const total = stats.total_calls || 1;
                    const pct = (count / total * 100);
                    return (
                      <div key={cat}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground capitalize">{cat.replace('_', ' ')}</span>
                          <span className="font-mono text-foreground/70">{count}</span>
                        </div>
                        <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500/50 rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Top Paths */}
          {stats?.top_paths && stats.top_paths.length > 0 && (
            <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold">Top Endpoints</h3>
              </div>
              <div className="space-y-1.5">
                {stats.top_paths.slice(0, 8).map(p => (
                  <div key={p.path} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/20 transition-colors">
                    <span className="font-mono text-foreground/70 truncate">{p.path}</span>
                    <span className="font-mono text-muted-foreground bg-muted/20 px-1.5 py-0.5 rounded text-[10px]">{p.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────
import { useLanguage } from '../i18n';

export function BrainInspector() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'inspector' | 'activity'>('activity');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<string>('all');

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/sessions`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchBrainData = useCallback(async (sid: string) => {
    setLoading(true);
    try {
      const [statusRes, eventsRes] = await Promise.all([
        fetch(`${API}/api/brain/${sid}/status`),
        fetch(`${API}/api/sessions/${sid}/events?limit=100`),
      ]);
      const statusData = await statusRes.json();
      const eventsData = await eventsRes.json();
      setBrainStatus(statusData);
      setEvents(eventsData.events || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (selectedSession) fetchBrainData(selectedSession);
  }, [selectedSession, fetchBrainData]);

  const doAction = async (action: string, method = 'POST') => {
    if (!selectedSession) return;
    setActionLoading(action);
    try {
      await fetch(`${API}/api/brain/${selectedSession}/${action}`, { method });
      await fetchBrainData(selectedSession);
    } catch (e) { console.error(e); }
    setActionLoading(null);
  };

  const eventTypeCounts = brainStatus?.event_summary?.event_types || {};

  // Filter events
  const filteredEvents = events.filter(e => {
    if (eventFilter === 'all') return true;
    if (eventFilter === 'tools') return ['tool.call', 'tool.result', 'tool.error'].includes(e.event_type);
    if (eventFilter === 'messages') return ['message.user', 'message.agent'].includes(e.event_type);
    if (eventFilter === 'files') return e.event_type.startsWith('file.');
    if (eventFilter === 'context') return e.event_type.startsWith('context.');
    if (eventFilter === 'agents') return e.event_type.startsWith('agent.');
    if (eventFilter === 'errors') return e.event_type === 'error' || e.event_type === 'tool.error';
    return true;
  });

  const filterButtons = [
    { key: 'all', label: 'All', icon: Eye },
    { key: 'tools', label: 'Tools', icon: Wrench },
    { key: 'messages', label: 'Messages', icon: MessageSquare },
    { key: 'files', label: 'Files', icon: FileText },
    { key: 'context', label: 'Context', icon: Database },
    { key: 'agents', label: 'Agents', icon: Brain },
    { key: 'errors', label: 'Errors', icon: AlertTriangle },
  ];

  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Brain className="w-8 h-8 text-indigo-400" />
              {t('brain.title')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('brain.subtitle')}
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex gap-1 bg-muted/30 rounded-xl p-1 w-fit border border-border/30">
          <button
            onClick={() => setActiveTab('activity')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'activity'
                ? 'bg-indigo-500/15 text-indigo-400 shadow-sm border border-indigo-500/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Radio className={`w-4 h-4 ${activeTab === 'activity' ? 'animate-pulse' : ''}`} />
            {t('brain.tab.activity')}
          </button>
          <button
            onClick={() => setActiveTab('inspector')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'inspector'
                ? 'bg-indigo-500/15 text-indigo-400 shadow-sm border border-indigo-500/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Eye className="w-4 h-4" />
            {t('brain.tab.inspector')}
          </button>
        </div>

        {/* ═══ Activity Desk Tab ═══ */}
        {activeTab === 'activity' && <ActivityDesk />}

        {/* ═══ Session Inspector Tab ═══ */}
        {activeTab === 'inspector' && (
        <>

        {/* Session Selector */}
        <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-4">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
            {t('brain.selectSession')}
          </label>
          <div className="flex gap-2 flex-wrap max-h-[150px] overflow-y-auto pr-2 pb-2 custom-scrollbar">
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedSession(s.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  selectedSession === s.id
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                    : 'bg-muted/30 border-border/30 text-muted-foreground hover:border-border hover:text-foreground'
                }`}
              >
                <span className="font-mono mr-1.5 opacity-50">{s.id.slice(0, 6)}</span>
                {s.title}
              </button>
            ))}
          </div>
        </div>

        {selectedSession && !loading && brainStatus && (
          <>
            {/* Action Bar + Status */}
            <div className="flex items-center gap-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
                brainStatus.brain_state === 'active'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
              }`}>
                <span className={`w-2 h-2 rounded-full ${brainStatus.brain_state === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-400'}`} />
                {brainStatus.brain_state.toUpperCase()}
              </div>
              <span className="text-xs text-muted-foreground">
                Agent: <span className="font-mono text-foreground/70">{brainStatus.last_agent}</span>
              </span>
              <div className="ml-auto flex gap-2">
                {[
                  { action: 'wake', icon: RotateCcw, label: t('brain.wake'), color: 'text-sky-400' },
                  { action: 'pause', icon: Pause, label: t('brain.pause'), color: 'text-amber-400' },
                ].map(btn => (
                  <button
                    key={btn.action}
                    onClick={() => doAction(btn.action)}
                    disabled={!!actionLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/30 border border-border/30 hover:border-border hover:bg-muted/50 transition-all disabled:opacity-50"
                  >
                    <btn.icon className={`w-3.5 h-3.5 ${btn.color} ${actionLoading === btn.action ? 'animate-spin' : ''}`} />
                    {btn.label}
                  </button>
                ))}
                <button
                  onClick={() => fetchBrainData(selectedSession)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted/30 border border-border/30 hover:border-border hover:bg-muted/50 transition-all"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t('button.refresh')}
                </button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: t('brain.totalEvents'), value: brainStatus.event_summary.total_events, color: 'text-indigo-400', icon: Database },
                { label: t('brain.inputTokens'), value: brainStatus.token_usage.input_tokens.toLocaleString(), color: 'text-blue-400', icon: Zap },
                { label: t('brain.outputTokens'), value: brainStatus.token_usage.output_tokens.toLocaleString(), color: 'text-emerald-400', icon: Zap },
                { label: t('brain.duration'), value: `${(brainStatus.event_summary.duration_ms / 1000).toFixed(1)}s`, color: 'text-amber-400', icon: Clock },
                { label: t('brain.contextLoad'), value: `${(brainStatus.context.utilization * 100).toFixed(1)}%`, color: 'text-purple-400', icon: Gauge },
              ].map(stat => (
                <div key={stat.label} className="bg-card/30 backdrop-blur-md border border-border/30 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                    <stat.icon className="w-3 h-3" />
                    {stat.label}
                  </div>
                  <div className={`text-xl font-bold ${stat.color}`}>{stat.value}</div>
                </div>
              ))}
            </div>

            {/* Main Grid: Events + Context/Harness/Activity */}
            <div className="grid grid-cols-3 gap-6">
              {/* Event Timeline (2 cols) */}
              <div className="col-span-2 bg-card/50 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-semibold">{t('brain.eventLog')}</h3>
                    <span className="text-xs text-muted-foreground">({filteredEvents.length} events)</span>
                  </div>

                  {/* Event type filter chips */}
                  <div className="flex gap-1 flex-wrap">
                    {filterButtons.map(btn => (
                      <button
                        key={btn.key}
                        onClick={() => setEventFilter(btn.key)}
                        className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-all border ${
                          eventFilter === btn.key
                            ? 'bg-indigo-500/15 border-indigo-500/30 text-indigo-400'
                            : 'bg-muted/30 border-border/20 text-muted-foreground/60 hover:text-muted-foreground'
                        }`}
                      >
                        <btn.icon className="w-2.5 h-2.5" />
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Event type summary badges */}
                <div className="px-5 py-2 border-b border-border/20 flex gap-1.5 flex-wrap">
                  {Object.entries(eventTypeCounts).slice(0, 10).map(([type, count]) => {
                    const s = getEventStyle(type);
                    return (
                      <span key={type} className={`text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 ${s.color} border border-border/20`}>
                        {s.label}: {count}
                      </span>
                    );
                  })}
                </div>

                <div className="max-h-[600px] overflow-y-auto p-2 space-y-0.5">
                  {filteredEvents.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Database className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">No events yet</p>
                      <p className="text-xs mt-1">Run a task via WebSocket to populate the event log</p>
                    </div>
                  ) : (
                    filteredEvents.map(event => <EventItem key={event.id} event={event} />)
                  )}
                </div>
              </div>

              {/* Right column: Activity + Context + Harness */}
              <div className="space-y-6">
                <ActivitySummary events={events} />
                <ContextGauge stats={brainStatus.context} />
                <HarnessCard config={brainStatus.harness} />
              </div>
            </div>
          </>
        )}

        {loading && (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        )}
        </>
        )}
      </div>
    </div>
  );
}
