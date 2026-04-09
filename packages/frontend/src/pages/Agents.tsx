import { useState, useEffect } from 'react';
import {
  Settings, Sparkles, Brain, Code, Server, ImageIcon,
  ChevronDown, ChevronRight, ExternalLink, Zap, Shield,
  Globe, HardDrive, Package, Puzzle, RefreshCw,
  Check, X, FolderOpen, FileText, Link2,
} from 'lucide-react';

// ─── Types ──────────────────────
interface Skill {
  id: string;
  name: string;
  description: string;
  agent: string;
  path: string;
  file_count?: number;
  is_symlink?: boolean;
  is_system?: boolean;
  link_target?: string;
}

interface AgentConfig {
  model?: string;
  provider?: string;
  base_url?: string;
  personality?: string;
  model_reasoning_effort?: string;
  [key: string]: any;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  class: string;
  color: string;
  icon: string;
  description: string;
  capabilities: string[];
  status: string;
  config: AgentConfig;
  skills: Skill[];
  skill_count: number;
}

const ICON_MAP: Record<string, any> = {
  sparkles: Sparkles,
  brain: Brain,
  code: Code,
  server: Server,
  image: ImageIcon,
};

const CAPABILITY_LABELS: Record<string, { label: string; icon: any }> = {
  code_generation: { label: 'Code Gen', icon: Code },
  file_operations: { label: 'File Ops', icon: FolderOpen },
  web_search: { label: 'Web Search', icon: Globe },
  mcp_tools: { label: 'MCP Tools', icon: Puzzle },
  skills: { label: 'Skills', icon: Package },
  multi_modal: { label: 'Multi-modal', icon: ImageIcon },
  long_context: { label: 'Long Context', icon: FileText },
  plugins: { label: 'Plugins', icon: Puzzle },
  text_generation: { label: 'Text Gen', icon: Zap },
  multi_model: { label: 'Multi-model', icon: Server },
  local_inference: { label: 'Local', icon: HardDrive },
  privacy: { label: 'Private', icon: Shield },
  image_generation: { label: 'Image Gen', icon: ImageIcon },
};

// ─── Skill Card ──────────────────────
function SkillCard({ skill }: { skill: Skill }) {
  return (
    <div className="group flex items-start gap-3 p-3 rounded-lg bg-background/40 border border-border/30 hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all">
      <div className="mt-0.5 p-1.5 bg-muted/50 rounded-md shrink-0">
        {skill.is_system
          ? <Shield className="w-3.5 h-3.5 text-amber-400" />
          : skill.is_symlink
            ? <Link2 className="w-3.5 h-3.5 text-blue-400" />
            : <Package className="w-3.5 h-3.5 text-indigo-400" />
        }
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground truncate">{skill.name}</span>
          {skill.is_system && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium shrink-0">SYSTEM</span>
          )}
          {skill.is_symlink && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium shrink-0">LINKED</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
          {skill.description}
        </p>
        {skill.file_count !== undefined && skill.file_count > 0 && (
          <span className="inline-block text-[10px] text-muted-foreground mt-1 opacity-60">{skill.file_count} files</span>
        )}
      </div>
    </div>
  );
}

// ─── Agent Card ──────────────────────
function AgentCard({ agent }: { agent: Agent }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = ICON_MAP[agent.icon] || Zap;
  const isCloud = agent.class === 'cloud';

  return (
    <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-all">
      {/* Header */}
      <div className="p-5">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center gap-3">
            <div
              className="p-2.5 rounded-lg border border-border/50"
              style={{ backgroundColor: agent.color + '15', borderColor: agent.color + '30' }}
            >
              <Icon className="w-5 h-5" style={{ color: agent.color }} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-lg">{agent.name}</h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  isCloud
                    ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                    : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                }`}>
                  {isCloud ? <Globe className="w-2.5 h-2.5 inline mr-0.5 -mt-px" /> : <HardDrive className="w-2.5 h-2.5 inline mr-0.5 -mt-px" />}
                  {isCloud ? 'CLOUD' : 'LOCAL'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {agent.config.provider} · <span className="font-mono text-foreground/70">{agent.config.model}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
              agent.status === 'active'
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : 'bg-zinc-500/10 border-zinc-500/20 text-zinc-400'
            }`}>
              {agent.status === 'active' ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
              {agent.status === 'active' ? 'Active' : 'Disabled'}
            </span>
          </div>
        </div>

        <p className="text-sm text-muted-foreground leading-relaxed mb-3">{agent.description}</p>

        {/* Capabilities */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {agent.capabilities.map(cap => {
            const def = CAPABILITY_LABELS[cap];
            if (!def) return null;
            const CapIcon = def.icon;
            return (
              <span key={cap} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/30">
                <CapIcon className="w-3 h-3" />
                {def.label}
              </span>
            );
          })}
        </div>

        {/* Config extras */}
        {agent.config.model_reasoning_effort && (
          <div className="text-[11px] text-muted-foreground">
            Reasoning: <span className="text-foreground/70 font-medium">{agent.config.model_reasoning_effort}</span>
            {agent.config.personality && <> · Personality: <span className="text-foreground/70 font-medium">{agent.config.personality}</span></>}
          </div>
        )}
        {agent.config.base_url && (
          <div className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
            Endpoint: <span className="text-foreground/60">{agent.config.base_url}</span>
          </div>
        )}
      </div>

      {/* Skills Section */}
      {agent.skill_count > 0 && (
        <div className="border-t border-border/30">
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between px-5 py-3 text-sm text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4" />
              <span className="font-medium">{agent.skill_count} Skills Installed</span>
              {agent.skills.filter(s => s.is_system).length > 0 && (
                <span className="text-[10px] text-amber-400/70">
                  ({agent.skills.filter(s => s.is_system).length} system)
                </span>
              )}
            </div>
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {expanded && (
            <div className="px-4 pb-4 space-y-2">
              {/* User skills first, then system */}
              {agent.skills
                .sort((a, b) => (a.is_system ? 1 : 0) - (b.is_system ? 1 : 0))
                .map(skill => (
                  <SkillCard key={skill.id} skill={skill} />
                ))
              }
            </div>
          )}
        </div>
      )}

      {agent.skill_count === 0 && (
        <div className="border-t border-border/30 px-5 py-3">
          <p className="text-xs text-muted-foreground/50 italic">No user skills installed</p>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────
export function Agents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'cloud' | 'local'>('all');

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://localhost:8000/api/agents');
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (e) {
      console.error('Failed to load agents:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAgents(); }, []);

  const filtered = filter === 'all' ? agents : agents.filter(a => a.class === filter);
  const totalSkills = agents.reduce((sum, a) => sum + a.skill_count, 0);
  const activeCount = agents.filter(a => a.status === 'active').length;

  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agents & Skills</h1>
            <p className="text-muted-foreground mt-1">
              {activeCount} active agents · {totalSkills} skills installed
            </p>
          </div>
          <button
            onClick={fetchAgents}
            disabled={loading}
            className="bg-card hover:bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-border/50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Cloud Agents', value: agents.filter(a => a.class === 'cloud').length, sub: 'CLI-based', color: 'text-sky-400', bg: 'bg-sky-500/10' },
            { label: 'Local Models', value: agents.filter(a => a.class === 'local').length, sub: 'Self-hosted', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
            { label: 'Total Skills', value: totalSkills, sub: 'Across all agents', color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
          ].map(stat => (
            <div key={stat.label} className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-4">
              <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
              <div className="text-sm font-medium text-foreground mt-0.5">{stat.label}</div>
              <div className="text-xs text-muted-foreground">{stat.sub}</div>
            </div>
          ))}
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit border border-border/30">
          {(['all', 'cloud', 'local'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                filter === f
                  ? 'bg-card text-foreground shadow-sm border border-border/50'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {f === 'all' ? 'All' : f === 'cloud' ? '☁️ Cloud' : '🖥 Local'}
            </button>
          ))}
        </div>

        {/* Agent Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filtered.map(agent => (
              <AgentCard key={agent.id} agent={agent} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
