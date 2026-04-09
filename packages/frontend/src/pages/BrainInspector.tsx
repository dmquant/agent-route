import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Activity, Clock, Zap, RefreshCw,
  Play, Pause, RotateCcw, AlertTriangle, CheckCircle2,
  XCircle, ArrowRight, Database, Gauge, Eye,
  MessageSquare, Terminal, TrendingUp,
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
  'tool.call':          { color: 'text-amber-400',   icon: Play,          label: 'Call' },
  'tool.result':        { color: 'text-green-400',   icon: CheckCircle2,  label: 'Result' },
  'tool.error':         { color: 'text-red-400',     icon: XCircle,       label: 'Error' },
  'agent.selected':     { color: 'text-indigo-400',  icon: Brain,         label: 'Selected' },
  'agent.delegated':    { color: 'text-purple-400',  icon: ArrowRight,    label: 'Delegated' },
  'agent.joined':       { color: 'text-purple-300',  icon: CheckCircle2,  label: 'Joined' },
  'session.created':    { color: 'text-sky-400',     icon: Play,          label: 'Created' },
  'session.resumed':    { color: 'text-sky-300',     icon: RotateCcw,     label: 'Resumed' },
  'session.paused':     { color: 'text-zinc-400',    icon: Pause,         label: 'Paused' },
  'context.compact':    { color: 'text-orange-400',  icon: Database,      label: 'Compact' },
  'context.checkpoint': { color: 'text-cyan-400',    icon: Database,      label: 'Checkpoint' },
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
          <span className="text-muted-foreground/50 ml-auto font-mono text-[10px]">
            #{event.id} · {ts}
          </span>
        </div>
        {event.content && (
          <p className={`text-xs text-muted-foreground mt-1 ${expanded ? '' : 'line-clamp-1'}`}>
            {event.content}
          </p>
        )}
        {expanded && Object.keys(event.metadata).length > 0 && (
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

// ─── Main Page ──────────────────────
export function BrainInspector() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [brainStatus, setBrainStatus] = useState<BrainStatus | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

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

  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Brain className="w-8 h-8 text-indigo-400" />
              Brain Inspector
            </h1>
            <p className="text-muted-foreground mt-1">
              Session event logs, context windows, and orchestrator status
            </p>
          </div>
        </div>

        {/* Session Selector */}
        <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-4">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
            Select Session
          </label>
          <div className="flex gap-2 flex-wrap">
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
                  { action: 'wake', icon: RotateCcw, label: 'Wake', color: 'text-sky-400' },
                  { action: 'pause', icon: Pause, label: 'Pause', color: 'text-amber-400' },
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
                  Refresh
                </button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-5 gap-3">
              {[
                { label: 'Total Events', value: brainStatus.event_summary.total_events, color: 'text-indigo-400', icon: Database },
                { label: 'Input Tokens', value: brainStatus.token_usage.input_tokens.toLocaleString(), color: 'text-blue-400', icon: Zap },
                { label: 'Output Tokens', value: brainStatus.token_usage.output_tokens.toLocaleString(), color: 'text-emerald-400', icon: Zap },
                { label: 'Duration', value: `${(brainStatus.event_summary.duration_ms / 1000).toFixed(1)}s`, color: 'text-amber-400', icon: Clock },
                { label: 'Context Load', value: `${(brainStatus.context.utilization * 100).toFixed(1)}%`, color: 'text-purple-400', icon: Gauge },
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

            {/* Main Grid: Events + Context/Harness */}
            <div className="grid grid-cols-3 gap-6">
              {/* Event Timeline (2 cols) */}
              <div className="col-span-2 bg-card/50 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
                  <div className="flex items-center gap-2">
                    <Eye className="w-5 h-5 text-indigo-400" />
                    <h3 className="font-semibold">Event Log</h3>
                    <span className="text-xs text-muted-foreground">({events.length} events)</span>
                  </div>

                  {/* Event type chips */}
                  <div className="flex gap-1.5 flex-wrap">
                    {Object.entries(eventTypeCounts).slice(0, 6).map(([type, count]) => {
                      const s = getEventStyle(type);
                      return (
                        <span key={type} className={`text-[10px] px-1.5 py-0.5 rounded-full bg-muted/50 ${s.color} border border-border/20`}>
                          {s.label}: {count}
                        </span>
                      );
                    })}
                  </div>
                </div>

                <div className="max-h-[600px] overflow-y-auto p-2 space-y-0.5">
                  {events.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                      <Database className="w-8 h-8 mb-2 opacity-30" />
                      <p className="text-sm">No events yet</p>
                      <p className="text-xs mt-1">Run a task via WebSocket to populate the event log</p>
                    </div>
                  ) : (
                    events.map(event => <EventItem key={event.id} event={event} />)
                  )}
                </div>
              </div>

              {/* Right column: Context + Harness */}
              <div className="space-y-6">
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
      </div>
    </div>
  );
}
