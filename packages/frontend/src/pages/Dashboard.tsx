import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Activity, Clock, Zap, CheckCircle2,
  AlertTriangle, Trophy, Cpu,
  ArrowUpRight, ArrowDownRight, RefreshCw, Calendar,
  Timer, Layers, Users, Target, Gauge, Flame,
} from 'lucide-react';

const API = 'http://localhost:8000';

// ─── Types ──────────────────────
interface TaskMetrics {
  total_tasks: number;
  success_count: number;
  error_count: number;
  success_rate: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  max_latency_ms: number;
  min_latency_ms: number;
  total_output_bytes: number;
  total_output_chunks: number;
  unique_agents: number;
  unique_sessions: number;
}

interface AgentBreakdown {
  [agent: string]: {
    total: number;
    success: number;
    failed: number;
    success_rate: number;
    avg_latency_ms: number;
    p50_latency_ms: number;
    p95_latency_ms: number;
    max_latency_ms: number;
    output_bytes: number;
    output_chunks: number;
    recent_errors: Array<{ task_id: string; error: string; timestamp: number }>;
  };
}

interface HourlyEntry {
  hour: string;
  total: number;
  success: number;
  failed: number;
}

interface DailyEntry {
  date: string;
  total: number;
  success: number;
  failed: number;
}

interface AnalyticsData {
  date: string;
  days: number;
  metrics: TaskMetrics;
  agent_breakdown: AgentBreakdown;
  hourly_heatmap: HourlyEntry[];
  daily_breakdown: DailyEntry[];
  recent_errors: Array<{
    task_id: string;
    session_id: string;
    agent: string;
    error: string;
    prompt: string;
    elapsed_ms: number;
    timestamp: number;
  }>;
  top_sessions: Array<{ session_id: string; task_count: number }>;
}

interface BenchmarkData {
  agents: string[];
  comparison: AgentBreakdown;
  categories: Record<string, string>;
  scores: Record<string, number>;
  winner: string | null;
  period_days: number;
}

// ─── Utilities ──────────────────────
function formatLatency(ms: number): string {
  if (ms <= 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0B';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

const AGENT_COLORS: Record<string, { bg: string; text: string; bar: string; gradient: string }> = {
  gemini:  { bg: 'bg-blue-500/10',   text: 'text-blue-400',   bar: 'bg-blue-500',    gradient: 'from-blue-500/20 to-blue-600/5' },
  claude:  { bg: 'bg-orange-500/10', text: 'text-orange-400', bar: 'bg-orange-500',   gradient: 'from-orange-500/20 to-orange-600/5' },
  codex:   { bg: 'bg-emerald-500/10',text: 'text-emerald-400',bar: 'bg-emerald-500',  gradient: 'from-emerald-500/20 to-emerald-600/5' },
  ollama:  { bg: 'bg-purple-500/10', text: 'text-purple-400', bar: 'bg-purple-500',   gradient: 'from-purple-500/20 to-purple-600/5' },
  mflux:   { bg: 'bg-pink-500/10',   text: 'text-pink-400',   bar: 'bg-pink-500',     gradient: 'from-pink-500/20 to-pink-600/5' },
};

function getAgentColor(agent: string) {
  return AGENT_COLORS[agent] || { bg: 'bg-zinc-500/10', text: 'text-zinc-400', bar: 'bg-zinc-500', gradient: 'from-zinc-500/20 to-zinc-600/5' };
}

// ─── Metric Card ──────────────────────
function MetricCard({ label, value, subValue, icon: Icon, color, trend }: {
  label: string;
  value: string | number;
  subValue?: string;
  icon: any;
  color: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  return (
    <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5 shadow-sm hover:shadow-md transition-all hover:border-border/80 group">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</span>
        <div className={`p-2 rounded-lg ${color} bg-opacity-10 group-hover:scale-110 transition-transform`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
      </div>
      <div className="text-2xl font-bold tracking-tight">{value}</div>
      {subValue && (
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
          {trend === 'up' && <ArrowUpRight className="w-3 h-3 text-green-400" />}
          {trend === 'down' && <ArrowDownRight className="w-3 h-3 text-red-400" />}
          {subValue}
        </div>
      )}
    </div>
  );
}

// ─── Hourly Heatmap ──────────────────────
function HourlyHeatmap({ data }: { data: HourlyEntry[] }) {
  const maxTotal = Math.max(1, ...data.map(d => d.total));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold">Hourly Activity</h3>
      </div>
      <div className="grid grid-cols-12 gap-1">
        {data.map((entry, i) => {
          const intensity = entry.total / maxTotal;
          const failRatio = entry.total > 0 ? entry.failed / entry.total : 0;
          return (
            <div
              key={i}
              className="group relative"
              title={`${entry.hour}: ${entry.total} tasks (${entry.success}✓ ${entry.failed}✗)`}
            >
              <div
                className="rounded-md h-10 transition-all group-hover:scale-110 group-hover:ring-1 group-hover:ring-indigo-500/30"
                style={{
                  backgroundColor: entry.total === 0
                    ? 'rgba(255,255,255,0.02)'
                    : failRatio > 0.5
                      ? `rgba(239,68,68,${0.15 + intensity * 0.6})`
                      : `rgba(99,102,241,${0.1 + intensity * 0.7})`,
                }}
              />
              {i % 3 === 0 && (
                <span className="text-[9px] text-muted-foreground/50 text-center block mt-1">
                  {entry.hour.replace(':00', '')}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground/50 px-1">
        <span>Less</span>
        <div className="flex gap-1">
          {[0.1, 0.3, 0.5, 0.7, 0.9].map(i => (
            <div key={i} className="w-3 h-3 rounded-sm" style={{ backgroundColor: `rgba(99,102,241,${i})` }} />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
}

// ─── Daily Sparkline ──────────────────────
function DailySparkline({ data }: { data: DailyEntry[] }) {
  if (data.length === 0) return null;
  const maxT = Math.max(1, ...data.map(d => d.total));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold">Daily Trend</h3>
        <span className="text-[10px] text-muted-foreground ml-auto">{data.length} days</span>
      </div>
      <div className="flex items-end gap-[3px] h-20">
        {data.map((d, i) => {
          const h = (d.total / maxT) * 100;
          const failH = d.total > 0 ? (d.failed / d.total) * h : 0;
          return (
            <div key={i} className="flex-1 flex flex-col justify-end group relative" title={`${d.date}: ${d.total} tasks`}>
              <div className="w-full rounded-t transition-all group-hover:opacity-80" style={{ height: `${Math.max(2, h - failH)}%`, background: 'rgba(99,102,241,0.5)' }} />
              {failH > 0 && (
                <div className="w-full rounded-b" style={{ height: `${failH}%`, background: 'rgba(239,68,68,0.5)' }} />
              )}
            </div>
          );
        })}
      </div>
      {data.length > 1 && (
        <div className="flex justify-between text-[9px] text-muted-foreground/50">
          <span>{data[0].date.slice(5)}</span>
          <span>{data[data.length - 1].date.slice(5)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Agent Performance Cards ──────────────────────
function AgentPerformanceGrid({ breakdown }: { breakdown: AgentBreakdown }) {
  const agents = Object.entries(breakdown).sort((a, b) => b[1].total - a[1].total);
  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        No agent data yet — run some tasks first
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {agents.map(([agent, data]) => {
        const colors = getAgentColor(agent);
        const successBarWidth = data.total > 0 ? (data.success / data.total) * 100 : 0;

        return (
          <div key={agent} className={`bg-gradient-to-br ${colors.gradient} border border-border/40 rounded-xl p-4 hover:border-border/60 transition-all`}>
            {/* Agent Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Cpu className={`w-4 h-4 ${colors.text}`} />
                <span className={`text-sm font-bold ${colors.text} uppercase tracking-wider`}>{agent}</span>
              </div>
              <span className="text-lg font-bold">{data.total}</span>
            </div>

            {/* Success Bar */}
            <div className="w-full h-1.5 bg-background/40 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full ${colors.bar} rounded-full transition-all`}
                style={{ width: `${successBarWidth}%` }}
              />
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div>
                <span className="text-muted-foreground block">Success</span>
                <span className="font-semibold text-green-400">{data.success_rate.toFixed(0)}%</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Avg</span>
                <span className="font-semibold font-mono">{formatLatency(data.avg_latency_ms)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">P95</span>
                <span className="font-semibold font-mono">{formatLatency(data.p95_latency_ms)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Output</span>
                <span className="font-semibold font-mono">{formatBytes(data.output_bytes)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Failed</span>
                <span className={`font-semibold ${data.failed > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>{data.failed}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Chunks</span>
                <span className="font-semibold font-mono">{data.output_chunks.toLocaleString()}</span>
              </div>
            </div>

            {/* Recent Errors */}
            {data.recent_errors.length > 0 && (
              <div className="mt-3 pt-2 border-t border-border/30">
                <span className="text-[10px] text-red-400/80 font-medium">Recent Errors:</span>
                {data.recent_errors.slice(0, 2).map((err, i) => (
                  <div key={i} className="text-[10px] text-muted-foreground mt-1 truncate font-mono">
                    ⚠ {err.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Benchmark Leaderboard ──────────────────────
function BenchmarkLeaderboard({ benchmark }: { benchmark: BenchmarkData | null }) {
  if (!benchmark || benchmark.agents.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-6">
        No benchmark data — agents need more task history
      </div>
    );
  }

  const sorted = [...benchmark.agents].sort((a, b) => (benchmark.scores[b] || 0) - (benchmark.scores[a] || 0));
  const maxScore = Math.max(1, ...Object.values(benchmark.scores));

  return (
    <div className="space-y-4">
      {sorted.map((agent, idx) => {
        const score = benchmark.scores[agent] || 0;
        const colors = getAgentColor(agent);
        const isWinner = benchmark.winner === agent;
        const data = benchmark.comparison[agent];

        return (
          <div
            key={agent}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
              isWinner
                ? 'bg-amber-500/5 border-amber-500/30 ring-1 ring-amber-500/20'
                : 'bg-card/30 border-border/30 hover:border-border/50'
            }`}
          >
            {/* Rank */}
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
              idx === 0 ? 'bg-amber-500/20 text-amber-400' :
              idx === 1 ? 'bg-zinc-400/20 text-zinc-300' :
              idx === 2 ? 'bg-orange-800/20 text-orange-600' :
              'bg-muted/30 text-muted-foreground'
            }`}>
              {idx === 0 ? <Trophy className="w-3.5 h-3.5" /> : `#${idx + 1}`}
            </div>

            {/* Agent name */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`text-sm font-bold ${colors.text} uppercase`}>{agent}</span>
                {isWinner && <span className="text-[9px] px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded-full font-medium">CHAMPION</span>}
              </div>
              {data && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {data.total} tasks · {data.success_rate.toFixed(0)}% success · {formatLatency(data.avg_latency_ms)} avg
                </div>
              )}
            </div>

            {/* Score bar */}
            <div className="w-24">
              <div className="w-full h-2 bg-background/40 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.bar} rounded-full transition-all`}
                  style={{ width: `${(score / maxScore) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-muted-foreground text-right mt-0.5 font-mono">
                {score.toFixed(1)}pts
              </div>
            </div>
          </div>
        );
      })}

      {/* Category Winners */}
      {benchmark.categories && Object.keys(benchmark.categories).length > 0 && (
        <div className="pt-3 border-t border-border/30">
          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Awards</span>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {Object.entries(benchmark.categories).map(([category, agent]) => (
              <div key={category} className="flex items-center gap-2 text-[11px]">
                <span className="text-muted-foreground capitalize">{category.replace('_', ' ')}:</span>
                <span className={`font-semibold ${getAgentColor(agent).text}`}>{agent}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Error Feed ──────────────────────
function ErrorFeed({ errors }: { errors: AnalyticsData['recent_errors'] }) {
  if (errors.length === 0) {
    return (
      <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
        <CheckCircle2 className="w-4 h-4 text-green-400 mr-2" />
        No recent errors
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-64 overflow-y-auto custom-scrollbar">
      {errors.map((err, i) => {
        const colors = getAgentColor(err.agent);
        return (
          <div key={i} className="flex gap-3 p-2.5 rounded-lg bg-red-500/5 border border-red-500/10 hover:border-red-500/20 transition-colors">
            <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`text-[10px] px-1.5 py-0.5 ${colors.bg} ${colors.text} rounded font-medium uppercase`}>{err.agent}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{formatLatency(err.elapsed_ms)}</span>
              </div>
              <p className="text-[11px] text-red-300/80 font-mono truncate">{err.error}</p>
              {err.prompt && (
                <p className="text-[10px] text-muted-foreground truncate mt-0.5">→ {err.prompt}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


// ═══════════════════════════════════════════════════
// ─── Main Dashboard Component ─────────────────────
// ═══════════════════════════════════════════════════
import { useLanguage } from '../i18n';

export function Dashboard() {
  const { t } = useLanguage();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [benchmark, setBenchmark] = useState<BenchmarkData | null>(null);
  const [timeRange, setTimeRange] = useState(7);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [analyticsRes, benchmarkRes] = await Promise.all([
        fetch(`${API}/api/analytics?days=${timeRange}`).then(r => r.json()),
        fetch(`${API}/api/analytics/benchmark?days=${timeRange}`).then(r => r.json()),
      ]);
      setAnalytics(analyticsRes);
      setBenchmark(benchmarkRes);
      setLastRefresh(new Date());
    } catch (e) {
      console.error('Failed to fetch analytics:', e);
    } finally {
      setIsLoading(false);
    }
  }, [timeRange]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Auto-refresh every 30s
    return () => clearInterval(interval);
  }, [fetchData]);

  const m = analytics?.metrics;

  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
              <Gauge className="w-8 h-8 text-indigo-400" />
              {t('dashboard.title')}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t('dashboard.subtitle')}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Time Range Selector */}
            <div className="flex items-center gap-1 bg-card/50 rounded-lg border border-border/40 p-1">
              {[1, 7, 14, 30].map(d => (
                <button
                  key={d}
                  onClick={() => setTimeRange(d)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    timeRange === d
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/30'
                  }`}
                >
                  {d === 1 ? t('dashboard.today') : `${d}d`}
                </button>
              ))}
            </div>

            {/* Refresh */}
            <button
              onClick={fetchData}
              disabled={isLoading}
              className="p-2 rounded-lg bg-card/50 border border-border/40 hover:bg-muted/30 transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {lastRefresh && (
              <span className="text-[10px] text-muted-foreground">
                {lastRefresh.toLocaleTimeString()}
              </span>
            )}
          </div>
        </div>

        {/* Loading State */}
        {isLoading && !analytics && (
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-6 h-6 text-indigo-400 animate-spin" />
          </div>
        )}

        {analytics && m && (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <MetricCard
                label={t('dashboard.totalTasks')}
                value={m.total_tasks.toLocaleString()}
                subValue={`${m.unique_sessions} sessions`}
                icon={Layers}
                color="text-indigo-500"
              />
              <MetricCard
                label={t('dashboard.successRate')}
                value={`${m.success_rate}%`}
                subValue={`${m.success_count}✓ / ${m.error_count}✗`}
                icon={Target}
                color={m.success_rate >= 90 ? 'text-green-500' : m.success_rate >= 70 ? 'text-amber-500' : 'text-red-500'}
                trend={m.success_rate >= 90 ? 'up' : m.success_rate < 70 ? 'down' : 'neutral'}
              />
              <MetricCard
                label={t('dashboard.avgLatency')}
                value={formatLatency(m.avg_latency_ms)}
                subValue={`P95: ${formatLatency(m.p95_latency_ms)}`}
                icon={Timer}
                color="text-cyan-500"
              />
              <MetricCard
                label={t('dashboard.throughput')}
                value={formatBytes(m.total_output_bytes)}
                subValue={`${m.total_output_chunks.toLocaleString()} chunks`}
                icon={Zap}
                color="text-amber-500"
              />
              <MetricCard
                label={t('dashboard.activeAgents')}
                value={m.unique_agents}
                subValue={Object.keys(analytics.agent_breakdown).join(', ')}
                icon={Users}
                color="text-purple-500"
              />
              <MetricCard
                label={t('dashboard.errorCount')}
                value={m.error_count}
                subValue={analytics.recent_errors.length > 0 ? `Latest: ${analytics.recent_errors[0]?.agent}` : 'No errors'}
                icon={m.error_count > 0 ? Flame : CheckCircle2}
                color={m.error_count > 0 ? 'text-red-500' : 'text-green-500'}
                trend={m.error_count > 0 ? 'down' : 'up'}
              />
            </div>

            {/* Main Grid: Charts + Benchmark */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Activity Charts (2/3) */}
              <div className="lg:col-span-2 space-y-6">
                {/* Hourly Heatmap */}
                <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm relative">
                  <div className="absolute top-4 left-6 flex items-center gap-2 z-10">
                    <Clock className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold">{t('dashboard.hourlyActivity')}</h3>
                  </div>
                  <div className="pt-8 block">
                    <HourlyHeatmap data={analytics.hourly_heatmap} />
                  </div>
                </div>

                {/* Daily Trend + Agent Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm relative">
                    <div className="absolute top-4 left-6 flex items-center gap-2 z-10">
                      <Calendar className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-semibold">{t('dashboard.dailyTrend')}</h3>
                    </div>
                    <div className="pt-8 block">
                      <DailySparkline data={analytics.daily_breakdown} />
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-semibold">Percentiles</h3>
                    </div>
                    <div className="space-y-3">
                      {[
                        { label: 'Min', value: m.min_latency_ms, color: 'text-green-400' },
                        { label: 'P50', value: m.p50_latency_ms, color: 'text-blue-400' },
                        { label: 'Avg', value: m.avg_latency_ms, color: 'text-indigo-400' },
                        { label: 'P95', value: m.p95_latency_ms, color: 'text-amber-400' },
                        { label: 'Max', value: m.max_latency_ms, color: 'text-red-400' },
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground w-8">{item.label}</span>
                          <div className="flex-1 mx-3 h-1.5 bg-background/40 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${item.color.replace('text-', 'bg-')}`}
                              style={{ width: `${m.max_latency_ms > 0 ? Math.max(3, (item.value / m.max_latency_ms) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono font-medium w-16 text-right">{formatLatency(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Agent Performance Grid */}
                <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Cpu className="w-4 h-4 text-indigo-400" />
                    <h3 className="text-sm font-semibold">{t('dashboard.agentPerf')}</h3>
                    <span className="text-[10px] text-muted-foreground ml-auto">
                      {Object.keys(analytics.agent_breakdown).length} agents
                    </span>
                  </div>
                  <AgentPerformanceGrid breakdown={analytics.agent_breakdown} />
                </div>
              </div>

              {/* Right Sidebar: Benchmark + Errors (1/3) */}
              <div className="space-y-6">
                {/* Benchmark Leaderboard */}
                <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-semibold">{t('dashboard.agentBenchmark')}</h3>
                    <span className="text-[10px] text-muted-foreground ml-auto">{timeRange}d window</span>
                  </div>
                  <BenchmarkLeaderboard benchmark={benchmark} />
                </div>

                {/* Error Feed */}
                <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <h3 className="text-sm font-semibold">{t('dashboard.recentErrors')}</h3>
                    {analytics.recent_errors.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded-full font-medium ml-auto">
                        {analytics.recent_errors.length}
                      </span>
                    )}
                  </div>
                  <ErrorFeed errors={analytics.recent_errors} />
                </div>

                {/* Top Sessions */}
                {analytics.top_sessions.length > 0 && (
                  <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      <h3 className="text-sm font-semibold">{t('dashboard.topSessions')}</h3>
                    </div>
                    <div className="space-y-2">
                      {analytics.top_sessions.slice(0, 8).map((s, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1.5 border-b border-border/20 last:border-0">
                          <span className="text-muted-foreground font-mono truncate max-w-[120px]" title={s.session_id}>
                            {s.session_id.slice(0, 8)}…
                          </span>
                          <div className="flex items-center gap-1.5">
                            <div className="w-12 h-1 bg-background/40 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full"
                                style={{ width: `${(s.task_count / Math.max(1, analytics.top_sessions[0].task_count)) * 100}%` }}
                              />
                            </div>
                            <span className="font-medium font-mono w-6 text-right">{s.task_count}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Empty State */}
        {!isLoading && analytics && m && m.total_tasks === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <BarChart3 className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-semibold text-muted-foreground">{t('dashboard.noData')}</h3>
            <p className="text-sm text-muted-foreground/70 mt-1 max-w-md">
              {t('dashboard.noDataDesc')}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
