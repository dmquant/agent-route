import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, BarChart3, Activity, MessageSquare, Zap, AlertTriangle,
  RefreshCw, Sparkles, Brain, Code, Server, ChevronLeft, ChevronRight,
  Clock, TrendingUp, FileText, CheckCircle2, XCircle, Loader2,
  ArrowRight, Hash, MessagesSquare, Star, Trash2, BookOpen, Archive,
  ChevronDown,
} from 'lucide-react';

const API = 'http://localhost:8000';

// ─── Types ──────────────────────
interface HourlyEntry { hour: string; queries: number; responses: number; total: number; }
interface AgentStat { queries: number; responses: number; input_tokens: number; output_tokens: number; total_tokens: number; session_count: number; }
interface SessionDetail { id: string; title: string; agent_type: string; message_count: number; first_query: string; }
interface ErrorEntry { session_id: string; agent: string; message: string; timestamp: number; }
interface LogEntry { id: number; title: string; agent: string; status: string; timestamp: number; }

interface DailyStats {
  date: string;
  total_sessions: number;
  active_sessions: number;
  total_messages: number;
  user_queries: number;
  agent_responses: number;
  estimated_input_tokens: number;
  estimated_output_tokens: number;
  estimated_total_tokens: number;
  agent_breakdown: Record<string, AgentStat>;
  hourly_activity: HourlyEntry[];
  top_sessions: SessionDetail[];
  errors: ErrorEntry[];
  error_count: number;
  log_stats: { total: number; success: number; error: number; running: number; };
  log_entries: LogEntry[];
}

interface SavedReport {
  id: string;
  date: string;
  days: number;
  agent: string;
  created_at: number;
  title: string;
  pinned: boolean;
  content_length: number;
  content?: string;
  stats_json?: DailyStats;
}

const AGENT_COLORS: Record<string, string> = {
  gemini: '#4285f4',
  claude: '#d97706',
  codex: '#10b981',
  ollama: '#8b5cf6',
  mflux: '#ec4899',
  unknown: '#6b7280',
};

const AGENT_ICONS: Record<string, any> = {
  gemini: Sparkles,
  claude: Brain,
  codex: Code,
  ollama: Server,
};

// ─── Mini Bar Chart (SVG) ──────────────────────
function ActivityChart({ data, height = 120 }: { data: HourlyEntry[]; height?: number }) {
  const maxVal = Math.max(1, ...data.map(d => d.total));
  const svgW = 700;
  const svgH = height;
  const barGap = 2;
  const actualBarW = svgW / data.length - barGap;

  return (
    <div className="w-full overflow-hidden">
      <svg viewBox={`0 0 ${svgW} ${svgH + 20}`} className="w-full h-auto" preserveAspectRatio="none">
        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(pct => (
          <line key={pct} x1="0" y1={svgH * (1 - pct)} x2={svgW} y2={svgH * (1 - pct)}
            stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const x = i * (actualBarW + barGap);
          const qH = (d.queries / maxVal) * svgH;
          const rH = (d.responses / maxVal) * svgH;
          return (
            <g key={i}>
              {/* Queries bar */}
              <rect x={x} y={svgH - qH - rH} width={actualBarW / 2}
                height={qH} rx="2" fill="#6366f1" opacity="0.8" />
              {/* Responses bar */}  
              <rect x={x + actualBarW / 2} y={svgH - rH}
                width={actualBarW / 2} height={rH} rx="2" fill="#22c55e" opacity="0.7" />
              {/* Hour labels every 3 hours */}
              {i % 3 === 0 && (
                <text x={x + actualBarW / 2} y={svgH + 14}
                  textAnchor="middle" fill="currentColor" opacity="0.4" fontSize="9">
                  {d.hour}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500 inline-block" /> Queries
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> Responses
        </span>
      </div>
    </div>
  );
}

// ─── Donut Chart ──────────────────────
function AgentDonut({ breakdown }: { breakdown: Record<string, AgentStat> }) {
  const agents = Object.entries(breakdown);
  const total = agents.reduce((sum, [, s]) => sum + s.total_tokens, 0);
  if (total === 0) return <div className="text-sm text-muted-foreground text-center py-8">No token data</div>;

  let cumulative = 0;
  const segments = agents.map(([name, stat]) => {
    const pct = stat.total_tokens / total;
    const start = cumulative;
    cumulative += pct;
    return { name, pct, start, color: AGENT_COLORS[name] || AGENT_COLORS.unknown, stat };
  });

  const r = 44;
  const cx = 55;
  const cy = 55;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 110 110" className="w-28 h-28 shrink-0">
        {segments.map((seg, i) => (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color} strokeWidth="12"
            strokeDasharray={`${seg.pct * circumference} ${circumference}`}
            strokeDashoffset={-seg.start * circumference}
            transform={`rotate(-90 ${cx} ${cy})`}
            className="transition-all duration-500" />
        ))}
        <text x={cx} y={cy - 4} textAnchor="middle" fill="currentColor" fontSize="13" fontWeight="700">
          {total >= 1000000 ? `${(total / 1000000).toFixed(1)}M` : total >= 1000 ? `${(total / 1000).toFixed(1)}K` : total}
        </text>
        <text x={cx} y={cy + 10} textAnchor="middle" fill="currentColor" opacity="0.5" fontSize="8">
          tokens
        </text>
      </svg>
      <div className="space-y-2 flex-1">
        {segments.map(seg => (
          <div key={seg.name} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="font-medium capitalize flex-1">{seg.name}</span>
            <span className="text-muted-foreground text-xs tabular-nums">{(seg.pct * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stat Card ──────────────────────
function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string; icon: any; color: string;
}) {
  return (
    <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-4 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={`p-1.5 rounded-md ${color} bg-opacity-10`}>
          <Icon className={`w-3.5 h-3.5 ${color}`} />
        </div>
      </div>
      <div className="text-2xl font-bold tabular-nums">{typeof value === 'number' ? value.toLocaleString() : value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Session Row ──────────────────────
function SessionRow({ session }: { session: SessionDetail }) {
  const Icon = AGENT_ICONS[session.agent_type] || Zap;
  const color = AGENT_COLORS[session.agent_type] || '#6b7280';
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-background/40 border border-border/30 hover:border-indigo-500/20 transition-all">
      <div className="p-1.5 rounded-md shrink-0" style={{ backgroundColor: color + '18' }}>
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium truncate">{session.title}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{session.message_count} msgs</span>
        </div>
        {session.first_query && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{session.first_query}</p>
        )}
      </div>
    </div>
  );
}

// ─── Report Viewer ──────────────────────
function ReportViewer({ content }: { content: string }) {
  const lines = content.split('\n');
  const rendered = lines.map((line, i) => {
    if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold mt-5 mb-2 text-foreground">{line.slice(4)}</h3>;
    if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-bold mt-6 mb-2 text-foreground border-b border-border/30 pb-1">{line.slice(3)}</h2>;
    if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-bold mt-6 mb-3 text-foreground">{line.slice(2)}</h1>;
    if (line.startsWith('- **')) {
      const match = line.match(/^- \*\*(.+?)\*\*:?\s*(.*)/);
      if (match) return <div key={i} className="flex gap-2 py-0.5 text-sm"><span className="font-semibold text-foreground">{match[1]}:</span><span className="text-muted-foreground">{match[2]}</span></div>;
    }
    if (line.startsWith('- ')) return <div key={i} className="text-sm text-muted-foreground py-0.5 pl-3 border-l-2 border-border/30">{line.slice(2)}</div>;
    if (line.trim() === '') return <div key={i} className="h-2" />;
    const boldRendered = line.replace(/\*\*(.+?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>');
    return <p key={i} className="text-sm text-muted-foreground leading-relaxed" dangerouslySetInnerHTML={{ __html: boldRendered }} />;
  });
  return <div className="space-y-0.5">{rendered}</div>;
}

// ─── Report History Sidebar Item ──────────────────────
function ReportHistoryItem({ report, isActive, onLoad, onPin, onDelete }: {
  report: SavedReport;
  isActive: boolean;
  onLoad: () => void;
  onPin: () => void;
  onDelete: () => void;
}) {
  const Icon = AGENT_ICONS[report.agent] || Zap;
  const color = AGENT_COLORS[report.agent] || '#6b7280';
  const timeStr = new Date(report.created_at).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const sizeStr = report.content_length >= 1024
    ? `${(report.content_length / 1024).toFixed(1)}KB`
    : `${report.content_length}B`;

  return (
    <div
      onClick={onLoad}
      className={`group p-3 rounded-lg cursor-pointer transition-all border ${
        isActive
          ? 'bg-indigo-500/10 border-indigo-500/30 shadow-sm'
          : 'bg-background/40 border-border/20 hover:border-border/50 hover:bg-muted/30'
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="p-1 rounded shrink-0 mt-0.5" style={{ backgroundColor: color + '18' }}>
          <Icon className="w-3 h-3" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {report.pinned && <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />}
            <span className="text-sm font-medium truncate">{report.title}</span>
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
            <span>{timeStr}</span>
            <span className="text-border">·</span>
            <span className="capitalize">{report.agent}</span>
            <span className="text-border">·</span>
            <span>{sizeStr}</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-amber-400 transition-colors"
            title={report.pinned ? 'Unpin' : 'Pin'}
          >
            <Star className={`w-3 h-3 ${report.pinned ? 'fill-amber-400 text-amber-400' : ''}`} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-400 transition-colors"
            title="Delete"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────
export function Routines() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [days, setDays] = useState(1);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportAgent, setReportAgent] = useState('gemini');
  const [report, setReport] = useState('');
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<'overview' | 'sessions' | 'errors' | 'report'>('overview');

  // Report History State
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/reports/daily?date=${date}&days=${days}`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch report:', e);
    } finally {
      setLoading(false);
    }
  }, [date, days]);

  const fetchSavedReports = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`${API}/api/reports?limit=50`);
      const data = await res.json();
      setSavedReports(data.reports || []);
    } catch (e) {
      console.error('Failed to fetch saved reports:', e);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchSavedReports(); }, [fetchSavedReports]);

  // Check if a report exists for current date
  useEffect(() => {
    const existing = savedReports.find(r => r.date === date);
    if (existing && !report && !activeReportId) {
      // Auto-load the existing report for this date
      loadReport(existing.id);
    }
  }, [savedReports, date]);

  const shiftDate = (offset: number) => {
    const d = new Date(date);
    d.setDate(d.getDate() + offset);
    setDate(d.toISOString().slice(0, 10));
    setReport('');
    setActiveReportId(null);
  };

  const generateReport = async () => {
    setGenerating(true);
    setTab('report');
    try {
      const res = await fetch(`${API}/api/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, days, agent: reportAgent }),
      });
      const data = await res.json();
      setReport(data.report || data.detail || 'No report generated');
      if (data.report_id) {
        setActiveReportId(data.report_id);
      }
      // Refresh the saved reports list
      fetchSavedReports();
    } catch (e: any) {
      setReport(`Error: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const loadReport = async (reportId: string) => {
    try {
      const res = await fetch(`${API}/api/reports/${reportId}`);
      const data = await res.json();
      setReport(data.content || '');
      setActiveReportId(reportId);
      setDate(data.date);
      setTab('report');
    } catch (e) {
      console.error('Failed to load report:', e);
    }
  };

  const togglePin = async (reportId: string, currentPinned: boolean) => {
    try {
      await fetch(`${API}/api/reports/${reportId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pinned: !currentPinned }),
      });
      fetchSavedReports();
    } catch (e) {
      console.error('Failed to toggle pin:', e);
    }
  };

  const deleteReport = async (reportId: string) => {
    if (!confirm('Delete this report permanently?')) return;
    try {
      await fetch(`${API}/api/reports/${reportId}`, { method: 'DELETE' });
      if (activeReportId === reportId) {
        setReport('');
        setActiveReportId(null);
      }
      fetchSavedReports();
    } catch (e) {
      console.error('Failed to delete report:', e);
    }
  };

  const isToday = date === new Date().toISOString().slice(0, 10);
  const dateLabel = isToday ? 'Today' : new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const dateReportCount = savedReports.filter(r => r.date === date).length;

  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Daily Usage Report</h1>
            <p className="text-muted-foreground mt-1">Activity analytics, token usage, and AI-generated insights</p>
          </div>
          <div className="flex items-center gap-2">
            {savedReports.length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-card border border-border/50 px-3 py-1.5 rounded-lg">
                <Archive className="w-3.5 h-3.5" />
                <span>{savedReports.length} saved</span>
              </div>
            )}
            <button onClick={fetchStats} disabled={loading}
              className="p-2 rounded-lg bg-card border border-border/50 text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Date Picker & Controls */}
        <div className="flex items-center justify-between bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <button onClick={() => shiftDate(-1)}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-400" />
              <input type="date" value={date} onChange={e => { setDate(e.target.value); setReport(''); setActiveReportId(null); }}
                className="bg-transparent text-sm font-medium border-none outline-none text-foreground" />
              <span className="text-xs text-muted-foreground">({dateLabel})</span>
              {dateReportCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 font-medium">
                  {dateReportCount} report{dateReportCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <button onClick={() => shiftDate(1)} disabled={isToday}
              className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-muted/30 p-1 rounded-lg border border-border/30">
            {[{ v: 1, l: '1 Day' }, { v: 3, l: '3 Days' }, { v: 7, l: '7 Days' }].map(p => (
              <button key={p.v} onClick={() => setDays(p.v)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                  days === p.v ? 'bg-card text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'
                }`}>
                {p.l}
              </button>
            ))}
          </div>

          {/* Agent selector + Generate button */}
          <div className="flex items-center gap-2">
            <select value={reportAgent} onChange={e => setReportAgent(e.target.value)}
              className="bg-card border border-border/50 rounded-lg px-3 py-1.5 text-sm text-foreground outline-none">
              <option value="gemini">Gemini CLI</option>
              <option value="claude">Claude Code</option>
              <option value="codex">Codex CLI</option>
              <option value="ollama">Ollama</option>
            </select>
            <button onClick={generateReport} disabled={generating || loading}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Report
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : stats ? (
          <>
            {/* KPI Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <StatCard label="Sessions" value={stats.total_sessions} sub={`${stats.active_sessions} active`} icon={Hash} color="text-indigo-500" />
              <StatCard label="Messages" value={stats.total_messages} sub={`${stats.user_queries}Q / ${stats.agent_responses}R`} icon={MessagesSquare} color="text-blue-500" />
              <StatCard label="Input Tokens" value={stats.estimated_input_tokens >= 1000 ? `${(stats.estimated_input_tokens / 1000).toFixed(1)}K` : stats.estimated_input_tokens} icon={ArrowRight} color="text-cyan-500" />
              <StatCard label="Output Tokens" value={stats.estimated_output_tokens >= 1000 ? `${(stats.estimated_output_tokens / 1000).toFixed(1)}K` : stats.estimated_output_tokens} icon={TrendingUp} color="text-green-500" />
              <StatCard label="Errors" value={stats.error_count} sub={stats.error_count > 0 ? 'needs attention' : 'all clear'} icon={AlertTriangle} color={stats.error_count > 0 ? 'text-red-500' : 'text-green-500'} />
              <StatCard label="Log Tasks" value={stats.log_stats.total} sub={`${stats.log_stats.success}✓ ${stats.log_stats.error}✗`} icon={FileText} color="text-orange-500" />
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit border border-border/30">
              {([
                { id: 'overview', label: 'Overview', icon: BarChart3 },
                { id: 'sessions', label: `Sessions (${stats.total_sessions})`, icon: MessageSquare },
                { id: 'errors', label: `Issues (${stats.error_count})`, icon: AlertTriangle },
                { id: 'report', label: 'AI Report', icon: Sparkles },
              ] as const).map(t => {
                const TIcon = t.icon;
                return (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
                      tab === t.id ? 'bg-card text-foreground shadow-sm border border-border/50' : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    <TIcon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content */}
            {tab === 'overview' && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Hourly Activity Chart */}
                <div className="lg:col-span-2 bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-400" />
                    Hourly Activity
                  </h3>
                  <ActivityChart data={stats.hourly_activity} />
                </div>

                {/* Token Breakdown Donut */}
                <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    Token Usage by Agent
                  </h3>
                  <AgentDonut breakdown={stats.agent_breakdown} />
                </div>

                {/* Agent Breakdown Table */}
                <div className="lg:col-span-2 bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-blue-400" />
                    Agent Breakdown
                  </h3>
                  {Object.entries(stats.agent_breakdown).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No agent activity for this period</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-border/30 text-muted-foreground text-xs uppercase tracking-wider">
                            <th className="text-left py-2 font-medium">Agent</th>
                            <th className="text-right py-2 font-medium">Sessions</th>
                            <th className="text-right py-2 font-medium">Queries</th>
                            <th className="text-right py-2 font-medium">Responses</th>
                            <th className="text-right py-2 font-medium">Input Tok.</th>
                            <th className="text-right py-2 font-medium">Output Tok.</th>
                            <th className="text-right py-2 font-medium">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(stats.agent_breakdown).map(([agent, s]) => {
                            const color = AGENT_COLORS[agent] || '#6b7280';
                            return (
                              <tr key={agent} className="border-b border-border/10 hover:bg-muted/20 transition-colors">
                                <td className="py-2.5 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                                  <span className="font-medium capitalize">{agent}</span>
                                </td>
                                <td className="text-right tabular-nums text-muted-foreground">{s.session_count}</td>
                                <td className="text-right tabular-nums">{s.queries}</td>
                                <td className="text-right tabular-nums">{s.responses}</td>
                                <td className="text-right tabular-nums text-muted-foreground">{s.input_tokens.toLocaleString()}</td>
                                <td className="text-right tabular-nums text-muted-foreground">{s.output_tokens.toLocaleString()}</td>
                                <td className="text-right tabular-nums font-semibold">{s.total_tokens.toLocaleString()}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Execution Logs Summary */}
                <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
                  <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-orange-400" />
                    Execution Logs
                  </h3>
                  <div className="space-y-3">
                    {stats.log_stats.total === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No execution logs</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { label: 'Success', val: stats.log_stats.success, cls: 'text-green-400' },
                            { label: 'Error', val: stats.log_stats.error, cls: 'text-red-400' },
                            { label: 'Running', val: stats.log_stats.running, cls: 'text-blue-400' },
                          ].map(s => (
                            <div key={s.label} className="bg-background/40 rounded-lg p-2 border border-border/20">
                              <div className={`text-xl font-bold ${s.cls}`}>{s.val}</div>
                              <div className="text-[10px] text-muted-foreground">{s.label}</div>
                            </div>
                          ))}
                        </div>
                        <div className="space-y-1.5 mt-3">
                          {stats.log_entries.slice(0, 5).map(log => (
                            <div key={log.id} className="flex items-center gap-2 text-xs py-1">
                              {log.status === 'success' ? (
                                <CheckCircle2 className="w-3 h-3 text-green-400 shrink-0" />
                              ) : log.status === 'error' ? (
                                <XCircle className="w-3 h-3 text-red-400 shrink-0" />
                              ) : (
                                <Clock className="w-3 h-3 text-blue-400 shrink-0" />
                              )}
                              <span className="truncate text-muted-foreground">{log.title}</span>
                              <span className="shrink-0 text-[10px] text-muted-foreground/50 capitalize">{log.agent}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {tab === 'sessions' && (
              <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4">Active Sessions ({stats.top_sessions.length})</h3>
                {stats.top_sessions.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-12">No sessions for this period</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {stats.top_sessions.map(s => <SessionRow key={s.id} session={s} />)}
                  </div>
                )}
              </div>
            )}

            {tab === 'errors' && (
              <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4">Issues & Errors ({stats.error_count})</h3>
                {stats.errors.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <CheckCircle2 className="w-10 h-10 text-green-400 mb-3" />
                    <p className="text-sm font-medium">No errors detected</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">All sessions completed without issues</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {stats.errors.map((err, i) => (
                      <div key={i} className="p-3 rounded-lg bg-red-500/5 border border-red-500/15">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                          <span className="text-xs font-medium capitalize" style={{ color: AGENT_COLORS[err.agent] || '#6b7280' }}>
                            {err.agent}
                          </span>
                          <span className="text-[10px] text-muted-foreground ml-auto">
                            {new Date(err.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-sm text-red-300 font-mono leading-relaxed">{err.message}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'report' && (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Report History Sidebar */}
                <div className="lg:col-span-1">
                  <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-4 sticky top-8">
                    <button
                      onClick={() => setShowHistory(!showHistory)}
                      className="flex items-center justify-between w-full text-sm font-semibold mb-3"
                    >
                      <span className="flex items-center gap-2">
                        <BookOpen className="w-4 h-4 text-indigo-400" />
                        Report History
                        {savedReports.length > 0 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400">
                            {savedReports.length}
                          </span>
                        )}
                      </span>
                      <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${
                        showHistory ? '' : '-rotate-90'
                      }`} />
                    </button>

                    {showHistory && (
                      <div className="space-y-2 max-h-[60vh] overflow-y-auto custom-scrollbar">
                        {historyLoading ? (
                          <div className="flex items-center justify-center py-8">
                            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : savedReports.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-6">
                            No saved reports yet. Generate one to get started.
                          </p>
                        ) : (
                          savedReports.map(r => (
                            <ReportHistoryItem
                              key={r.id}
                              report={r}
                              isActive={activeReportId === r.id}
                              onLoad={() => loadReport(r.id)}
                              onPin={() => togglePin(r.id, r.pinned)}
                              onDelete={() => deleteReport(r.id)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Report Content */}
                <div className="lg:col-span-3">
                  <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-indigo-400" />
                        AI-Generated Report
                      </h3>
                      {report && !generating && (
                        <div className="flex items-center gap-3">
                          {activeReportId && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Saved
                            </span>
                          )}
                          <span className="text-[10px] text-muted-foreground capitalize">Generated by {reportAgent}</span>
                        </div>
                      )}
                    </div>
                    {generating ? (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-400 mb-3" />
                        <p className="text-sm font-medium">Generating report with {reportAgent}...</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">This may take 15-30 seconds • Report will be saved automatically</p>
                      </div>
                    ) : report ? (
                      <div className="prose prose-sm dark:prose-invert max-w-none">
                        <ReportViewer content={report} />
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                        <FileText className="w-10 h-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium">No report generated yet</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">Select a model and click "Generate Report" above</p>
                        {dateReportCount > 0 && (
                          <p className="text-xs text-indigo-400 mt-3">
                            💡 {dateReportCount} saved report{dateReportCount > 1 ? 's' : ''} found for this date — check the history sidebar
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <p>Failed to load data. Check backend connection.</p>
          </div>
        )}
      </div>
    </div>
  );
}
