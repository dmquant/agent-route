import { useState, useEffect, useCallback } from 'react';
import {
  Plus, ArrowRight, GitMerge, Play, Save, Trash2, GripVertical,
  Sparkles, Brain, Code, Server, Image, ChevronDown, ChevronRight as ChevronRightIcon,
  FileText, X, Loader2, CheckCircle2, XCircle,
  Clock, AlertTriangle, Zap,
  ArrowDown, BookOpen, History,
} from 'lucide-react';

const API = 'http://localhost:8000';

// ─── Types ──────────────────────
interface WorkflowStep {
  id: string;
  name: string;
  agent: string;
  prompt: string;
  skills: string[];
  inputFiles: string[];
  config: {
    timeout: number;
    continue_on_error: boolean;
  };
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  config: Record<string, any>;
  created_at: number;
  updated_at: number;
  run_count?: number;
}

interface WorkflowRun {
  id: string;
  workflow_id: string;
  session_id: string;
  status: string;
  current_step: number;
  results: StepResult[];
  started_at: number;
  finished_at: number | null;
  error: string | null;
}

interface StepResult {
  step_id: string;
  step_index: number;
  agent: string;
  status: string;
  output?: string;
  error?: string;
  latency_ms?: number;
  started_at: number;
  finished_at: number;
}

interface AgentInfo {
  id: string;
  name: string;
  color: string;
  icon: string;
  capabilities: string[];
  skills: { id: string; name: string; description: string }[];
  status: string;
}

interface SessionInfo {
  id: string;
  title: string;
  agent_type: string;
  message_count: number;
}

const AGENT_COLORS: Record<string, string> = {
  gemini: '#4285f4', claude: '#d97706', codex: '#10b981',
  ollama: '#8b5cf6', mflux: '#ec4899',
};

const AGENT_ICONS: Record<string, any> = {
  gemini: Sparkles, claude: Brain, codex: Code,
  ollama: Server, mflux: Image,
};

const defaultStep = (): WorkflowStep => ({
  id: crypto.randomUUID(),
  name: '',
  agent: 'gemini',
  prompt: '',
  skills: [],
  inputFiles: [],
  config: { timeout: 3600, continue_on_error: false },
});

// ─── Step Card ──────────────────────
function StepCard({
  step, index, total, agents, onUpdate, onRemove, onMoveUp, onMoveDown,
  dragHandlers, isDragging, isExecuting, stepResult,
}: {
  step: WorkflowStep;
  index: number;
  total: number;
  agents: AgentInfo[];
  onUpdate: (s: WorkflowStep) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  dragHandlers: any;
  isDragging: boolean;
  isExecuting: boolean;
  stepResult?: StepResult;
}) {
  const [expanded, setExpanded] = useState(true);
  const [showSkills, setShowSkills] = useState(false);
  const agent = agents.find(a => a.id === step.agent);
  const AgentIcon = AGENT_ICONS[step.agent] || Zap;
  const color = AGENT_COLORS[step.agent] || '#6b7280';

  const statusIcon = stepResult ? (
    stepResult.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
    stepResult.status === 'error' ? <XCircle className="w-4 h-4 text-red-400" /> :
    stepResult.status === 'timeout' ? <Clock className="w-4 h-4 text-amber-400" /> :
    null
  ) : isExecuting ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /> : null;

  return (
    <div
      className={`bg-card/60 backdrop-blur-md border rounded-xl transition-all duration-200 ${
        isDragging ? 'opacity-50 border-indigo-500/50 scale-[0.98]' : 'border-border/50 hover:border-border'
      } ${isExecuting ? 'ring-2 ring-indigo-500/30' : ''} ${
        stepResult?.status === 'success' ? 'border-green-500/30' :
        stepResult?.status === 'error' ? 'border-red-500/30' : ''
      }`}
      draggable
      {...dragHandlers}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 p-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div {...dragHandlers} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground">
          <GripVertical className="w-4 h-4" />
        </div>
        <div className="flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold"
          style={{ backgroundColor: color + '20', color }}>
          {index + 1}
        </div>
        <div className="p-1.5 rounded-md" style={{ backgroundColor: color + '15' }}>
          <AgentIcon className="w-3.5 h-3.5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={step.name}
            onChange={e => { e.stopPropagation(); onUpdate({ ...step, name: e.target.value }); }}
            onClick={e => e.stopPropagation()}
            placeholder={`Step ${index + 1} — ${agent?.name || step.agent}`}
            className="bg-transparent text-sm font-medium text-foreground border-none outline-none w-full placeholder:text-muted-foreground/50"
          />
        </div>
        <div className="flex items-center gap-1">
          {statusIcon}
          {stepResult?.latency_ms && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{(stepResult.latency_ms / 1000).toFixed(1)}s</span>
          )}
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRightIcon className="w-3.5 h-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Body */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-border/20 pt-3">
          {/* Agent Selector */}
          <div className="flex items-center gap-2">
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider w-16 shrink-0">Agent</label>
            <div className="flex gap-1.5 flex-wrap flex-1">
              {agents.filter(a => a.status === 'active').map(a => {
                const AIcon = AGENT_ICONS[a.id] || Zap;
                const isSelected = step.agent === a.id;
                return (
                  <button
                    key={a.id}
                    onClick={() => onUpdate({ ...step, agent: a.id, skills: [] })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                      isSelected
                        ? 'border-current bg-current/10 shadow-sm'
                        : 'border-border/30 text-muted-foreground hover:border-border hover:text-foreground'
                    }`}
                    style={isSelected ? { color: a.color, borderColor: a.color + '50' } : {}}
                  >
                    <AIcon className="w-3 h-3" />
                    {a.name.split(' ')[0]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Prompt */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">Prompt</label>
            <textarea
              value={step.prompt}
              onChange={e => onUpdate({ ...step, prompt: e.target.value })}
              placeholder="Enter the task prompt for this step..."
              rows={3}
              className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-indigo-500/50 resize-y font-mono"
            />
          </div>

          {/* Skills */}
          {agent && agent.skills.length > 0 && (
            <div>
              <button
                onClick={() => setShowSkills(!showSkills)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground font-medium uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <BookOpen className="w-3 h-3" />
                Skills ({step.skills.length}/{agent.skills.length})
                <ChevronDown className={`w-3 h-3 transition-transform ${showSkills ? '' : '-rotate-90'}`} />
              </button>
              {showSkills && (
                <div className="grid grid-cols-2 gap-1.5 mt-2 max-h-32 overflow-y-auto custom-scrollbar">
                  {agent.skills.map(skill => (
                    <label
                      key={skill.id}
                      className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer border transition-all ${
                        step.skills.includes(skill.id)
                          ? 'bg-indigo-500/10 border-indigo-500/30 text-foreground'
                          : 'bg-background/40 border-border/20 text-muted-foreground hover:border-border/50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={step.skills.includes(skill.id)}
                        onChange={e => {
                          const newSkills = e.target.checked
                            ? [...step.skills, skill.id]
                            : step.skills.filter(s => s !== skill.id);
                          onUpdate({ ...step, skills: newSkills });
                        }}
                        className="accent-indigo-500 rounded"
                      />
                      <span className="truncate font-medium">{skill.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Input Files */}
          <div>
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">
              <FileText className="w-3 h-3 inline mr-1" />
              Input Files
            </label>
            <div className="flex flex-wrap gap-1.5">
              {step.inputFiles.map((f, fi) => (
                <span key={fi} className="flex items-center gap-1 bg-muted/40 px-2 py-0.5 rounded text-xs text-foreground">
                  {f}
                  <button onClick={() => {
                    const newFiles = step.inputFiles.filter((_, i) => i !== fi);
                    onUpdate({ ...step, inputFiles: newFiles });
                  }} className="text-muted-foreground hover:text-red-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  const name = prompt('Enter filename (will be uploaded to session workspace):');
                  if (name) onUpdate({ ...step, inputFiles: [...step.inputFiles, name] });
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-border/40 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                <Plus className="w-2.5 h-2.5" /> Add File
              </button>
            </div>
          </div>

          {/* Config row */}
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-muted-foreground">Timeout</label>
              <input
                type="number"
                value={step.config.timeout}
                onChange={e => onUpdate({ ...step, config: { ...step.config, timeout: parseInt(e.target.value) || 120 } })}
                className="w-16 bg-background/60 border border-border/40 rounded px-2 py-0.5 text-xs text-foreground outline-none"
              />
              <span className="text-[10px] text-muted-foreground">sec</span>
            </div>
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={step.config.continue_on_error}
                onChange={e => onUpdate({ ...step, config: { ...step.config, continue_on_error: e.target.checked } })}
                className="accent-indigo-500 rounded"
              />
              Continue on error
            </label>
            <div className="flex-1" />
            <div className="flex items-center gap-1">
              <button onClick={onMoveUp} disabled={index === 0}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                title="Move up">
                <ArrowDown className="w-3 h-3 rotate-180" />
              </button>
              <button onClick={onMoveDown} disabled={index === total - 1}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-20 transition-colors"
                title="Move down">
                <ArrowDown className="w-3 h-3" />
              </button>
              <button onClick={onRemove}
                className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                title="Remove step">
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Step Result (when executing) */}
          {stepResult && stepResult.output && (
            <div className="mt-2 p-3 bg-background/40 rounded-lg border border-border/20 max-h-48 overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Output</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  stepResult.status === 'success' ? 'bg-green-500/15 text-green-400' :
                  stepResult.status === 'error' ? 'bg-red-500/15 text-red-400' : 'bg-muted text-muted-foreground'
                }`}>{stepResult.status}</span>
              </div>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono leading-relaxed">
                {stepResult.output.slice(0, 2000)}
                {stepResult.output.length > 2000 && '...'}
              </pre>
            </div>
          )}
          {stepResult?.error && (
            <div className="p-2 bg-red-500/5 border border-red-500/15 rounded-lg">
              <p className="text-xs text-red-400 font-mono">{stepResult.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Run Modal ──────────────────────
function RunModal({ workflow, sessions, onRun, onClose }: {
  workflow: Workflow;
  sessions: SessionInfo[];
  onRun: (sessionId: string | null, title: string) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [selectedSession, setSelectedSession] = useState('');
  const [title, setTitle] = useState(`Workflow: ${workflow.name}`);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-md p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Play className="w-5 h-5 text-green-400" />
          Run Workflow
        </h3>
        <p className="text-sm text-muted-foreground">
          <strong>{workflow.name}</strong> — {workflow.steps.length} step{workflow.steps.length !== 1 ? 's' : ''}
        </p>

        {/* Session Mode */}
        <div className="flex gap-2">
          <button onClick={() => setMode('new')}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              mode === 'new' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'border-border/30 text-muted-foreground hover:text-foreground'
            }`}>
            <Plus className="w-4 h-4 mx-auto mb-1" />
            New Session
          </button>
          <button onClick={() => setMode('existing')}
            className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${
              mode === 'existing' ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400' : 'border-border/30 text-muted-foreground hover:text-foreground'
            }`}>
            <History className="w-4 h-4 mx-auto mb-1" />
            Existing Session
          </button>
        </div>

        {mode === 'new' ? (
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Session Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500/50"
            />
          </div>
        ) : (
          <div>
            <label className="text-xs text-muted-foreground font-medium block mb-1">Choose Session</label>
            <select
              value={selectedSession}
              onChange={e => setSelectedSession(e.target.value)}
              className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground outline-none"
            >
              <option value="">— Select a session —</option>
              {sessions.map(s => (
                <option key={s.id} value={s.id}>{s.title} ({s.message_count} msgs)</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button
            onClick={() => onRun(mode === 'existing' ? selectedSession : null, title)}
            disabled={mode === 'existing' && !selectedSession}
            className="flex-1 py-2 rounded-lg bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Play className="w-4 h-4" /> Start Run
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────
export function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editing, setEditing] = useState<Workflow | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [wfName, setWfName] = useState('');
  const [wfDesc, setWfDesc] = useState('');
  const [unsaved, setUnsaved] = useState(false);

  // Drag state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Execution state
  const [runModal, setRunModal] = useState<Workflow | null>(null);
  const [activeRun, setActiveRun] = useState<WorkflowRun | null>(null);

  // Runs history
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [showRuns, setShowRuns] = useState(false);

  // ─── Fetch ──────────────────────
  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/workflows`);
      const data = await res.json();
      setWorkflows(data.workflows || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/agents`);
      const data = await res.json();
      setAgents(data.agents || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/sessions`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (e) { console.error(e); }
  }, []);

  const fetchRuns = useCallback(async (workflowId: string) => {
    try {
      const res = await fetch(`${API}/api/workflows/${workflowId}/runs?limit=20`);
      const data = await res.json();
      setRuns(data.runs || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    Promise.all([fetchWorkflows(), fetchAgents(), fetchSessions()]).finally(() => setLoading(false));
  }, []);

  // Poll active run
  useEffect(() => {
    if (!activeRun || activeRun.status !== 'running') return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/api/workflow-runs/${activeRun.id}`);
        const data = await res.json();
        setActiveRun(data);
        if (data.status !== 'running') {
          clearInterval(interval);
          fetchWorkflows();
        }
      } catch (e) { console.error(e); }
    }, 2000);
    return () => clearInterval(interval);
  }, [activeRun?.id, activeRun?.status]);

  // ─── Editor Helpers ──────────────────────
  const openEditor = (wf?: Workflow) => {
    if (wf) {
      setEditing(wf);
      setSteps(wf.steps.map(s => ({ ...s })));
      setWfName(wf.name);
      setWfDesc(wf.description);
    } else {
      setEditing({ id: '', name: 'New Workflow', description: '', steps: [], config: {}, created_at: 0, updated_at: 0 });
      setSteps([defaultStep()]);
      setWfName('New Workflow');
      setWfDesc('');
    }
    setUnsaved(false);
    setActiveRun(null);
    setShowRuns(false);
  };

  const closeEditor = () => {
    if (unsaved && !confirm('You have unsaved changes. Discard?')) return;
    setEditing(null);
    setSteps([]);
    setActiveRun(null);
  };

  const updateStep = (index: number, step: WorkflowStep) => {
    const newSteps = [...steps];
    newSteps[index] = step;
    setSteps(newSteps);
    setUnsaved(true);
  };

  const removeStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
    setUnsaved(true);
  };

  const addStep = () => {
    setSteps([...steps, defaultStep()]);
    setUnsaved(true);
  };

  const moveStep = (from: number, to: number) => {
    if (to < 0 || to >= steps.length) return;
    const newSteps = [...steps];
    const [moved] = newSteps.splice(from, 1);
    newSteps.splice(to, 0, moved);
    setSteps(newSteps);
    setUnsaved(true);
  };

  // ─── Drag & Drop ──────────────────────
  const handleDragStart = (index: number) => (e: React.DragEvent) => {
    setDragIdx(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIdx(index);
  };

  const handleDrop = (index: number) => (e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== index) {
      moveStep(dragIdx, index);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
  };

  // ─── Save ──────────────────────
  const saveWorkflow = async () => {
    if (!editing) return;
    try {
      if (editing.id) {
        // Update
        const res = await fetch(`${API}/api/workflows/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: wfName, description: wfDesc, steps }),
        });
        const updated = await res.json();
        setEditing(updated);
      } else {
        // Create
        const res = await fetch(`${API}/api/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: wfName, description: wfDesc, steps }),
        });
        const created = await res.json();
        setEditing(created);
      }
      setUnsaved(false);
      fetchWorkflows();
    } catch (e) { console.error(e); }
  };

  const deleteWorkflow = async (id: string) => {
    if (!confirm('Delete this workflow permanently?')) return;
    try {
      await fetch(`${API}/api/workflows/${id}`, { method: 'DELETE' });
      if (editing?.id === id) closeEditor();
      fetchWorkflows();
    } catch (e) { console.error(e); }
  };

  // ─── Run ──────────────────────
  const startRun = async (sessionId: string | null, title: string) => {
    // Use runModal workflow (from list view) or editing workflow (from editor)
    const workflowId = runModal?.id || editing?.id;
    if (!workflowId) {
      // If in editor and not yet saved, save first
      if (editing && !editing.id) {
        await saveWorkflow();
      }
      return;
    }

    setRunModal(null);
    try {
      const res = await fetch(`${API}/api/workflows/${workflowId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId || undefined,
          session_title: title,
        }),
      });
      const data = await res.json();
      // Start polling
      setActiveRun({ ...data, results: [], current_step: 0 } as any);
      // Fetch full run
      setTimeout(async () => {
        const runRes = await fetch(`${API}/api/workflow-runs/${data.run_id}`);
        const runData = await runRes.json();
        setActiveRun(runData);
      }, 1000);
    } catch (e) { console.error(e); }
  };

  // ─── Render ──────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Editor View
  if (editing) {
    return (
      <>
      {runModal && <RunModal workflow={runModal} sessions={sessions} onRun={startRun} onClose={() => setRunModal(null)} />}
      <div className="p-6 h-full overflow-y-auto z-10 relative custom-scrollbar">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* Editor Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button onClick={closeEditor} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                <ChevronRightIcon className="w-4 h-4 rotate-180" />
              </button>
              <div>
                <input
                  value={wfName}
                  onChange={e => { setWfName(e.target.value); setUnsaved(true); }}
                  className="text-2xl font-bold bg-transparent border-none outline-none text-foreground"
                  placeholder="Workflow Name"
                />
                <input
                  value={wfDesc}
                  onChange={e => { setWfDesc(e.target.value); setUnsaved(true); }}
                  className="text-sm text-muted-foreground bg-transparent border-none outline-none w-full mt-0.5"
                  placeholder="Add a description..."
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              {unsaved && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">Unsaved</span>
              )}
              {editing.id && (
                <button
                  onClick={() => { fetchRuns(editing.id); setShowRuns(!showRuns); }}
                  className="p-2 rounded-lg bg-card border border-border/50 text-muted-foreground hover:text-foreground transition-colors"
                  title="Run History"
                >
                  <History className="w-4 h-4" />
                </button>
              )}
              <button onClick={saveWorkflow}
                className="flex items-center gap-2 bg-card border border-border/50 hover:bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                <Save className="w-4 h-4" /> Save
              </button>
              <button
                onClick={() => setRunModal(editing)}
                disabled={steps.length === 0 || steps.every(s => !s.prompt.trim())}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                <Play className="w-4 h-4" /> Run
              </button>
            </div>
          </div>

          {/* Active Run Status */}
          {activeRun && (
            <div className={`p-4 rounded-xl border ${
              activeRun.status === 'running' ? 'bg-indigo-500/5 border-indigo-500/20' :
              activeRun.status === 'completed' ? 'bg-green-500/5 border-green-500/20' :
              activeRun.status === 'failed' ? 'bg-red-500/5 border-red-500/20' :
              'bg-muted/30 border-border/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {activeRun.status === 'running' ? <Loader2 className="w-5 h-5 text-indigo-400 animate-spin" /> :
                   activeRun.status === 'completed' ? <CheckCircle2 className="w-5 h-5 text-green-400" /> :
                   activeRun.status === 'failed' ? <XCircle className="w-5 h-5 text-red-400" /> :
                   <AlertTriangle className="w-5 h-5 text-amber-400" />}
                  <div>
                    <span className="text-sm font-medium capitalize">{activeRun.status}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      Step {Math.min(activeRun.current_step + 1, steps.length)}/{steps.length}
                    </span>
                  </div>
                </div>
                {activeRun.status === 'running' && (
                  <button
                    onClick={async () => {
                      await fetch(`${API}/api/workflow-runs/${activeRun.id}/cancel`, { method: 'POST' });
                      const res = await fetch(`${API}/api/workflow-runs/${activeRun.id}`);
                      setActiveRun(await res.json());
                    }}
                    className="text-xs text-red-400 hover:text-red-300 px-3 py-1 rounded-lg border border-red-500/20 hover:bg-red-500/10 transition-colors"
                  >Cancel</button>
                )}
                {activeRun.error && (
                  <span className="text-xs text-red-400 max-w-xs truncate">{activeRun.error}</span>
                )}
                {activeRun.session_id && (
                  <a
                    href={`/workspace?session=${activeRun.session_id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      // Navigate to workspace/chat with the session — using history.pushState for SPA
                      window.location.hash = '';
                      window.dispatchEvent(new CustomEvent('navigate-to-session', { detail: activeRun.session_id }));
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300 px-3 py-1 rounded-lg border border-indigo-500/20 hover:bg-indigo-500/10 transition-colors flex items-center gap-1"
                    title="Open this session in the Workspace for live logs, Brain Inspector, etc."
                  >
                    <BookOpen className="w-3 h-3" /> View Session
                  </a>
                )}
              </div>
              {/* Progress bar */}
              {activeRun.status === 'running' && steps.length > 0 && (
                <div className="mt-3 h-1.5 bg-background/60 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${(activeRun.current_step / steps.length) * 100}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* Run History Panel */}
          {showRuns && (
            <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-400" />
                Run History
              </h3>
              {runs.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No runs yet</p>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto custom-scrollbar">
                  {runs.map(r => (
                    <div
                      key={r.id}
                      onClick={() => setActiveRun(r)}
                      className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all border ${
                        activeRun?.id === r.id ? 'bg-indigo-500/10 border-indigo-500/30' : 'bg-background/40 border-border/20 hover:border-border/50'
                      }`}
                    >
                      {r.status === 'completed' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" /> :
                       r.status === 'failed' ? <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" /> :
                       r.status === 'running' ? <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" /> :
                       <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-medium capitalize">{r.status}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          {r.results.length} step{r.results.length !== 1 ? 's' : ''}
                          {r.finished_at && r.started_at ? ` • ${((r.finished_at - r.started_at) / 1000).toFixed(1)}s` : ''}
                        </span>
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(r.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Steps Pipeline */}
          <div className="space-y-3">
            {steps.map((step, i) => (
              <div key={step.id}>
                {/* Drop zone indicator */}
                {dragOverIdx === i && dragIdx !== i && (
                  <div className="h-1 bg-indigo-500/40 rounded-full mx-8 mb-2 transition-all" />
                )}
                <StepCard
                  step={step}
                  index={i}
                  total={steps.length}
                  agents={agents}
                  onUpdate={s => updateStep(i, s)}
                  onRemove={() => removeStep(i)}
                  onMoveUp={() => moveStep(i, i - 1)}
                  onMoveDown={() => moveStep(i, i + 1)}
                  isDragging={dragIdx === i}
                  isExecuting={activeRun?.status === 'running' && activeRun.current_step === i}
                  stepResult={activeRun?.results?.find(r => r.step_index === i)}
                  dragHandlers={{
                    onDragStart: handleDragStart(i),
                    onDragOver: handleDragOver(i),
                    onDrop: handleDrop(i),
                    onDragEnd: handleDragEnd,
                  }}
                />
                {/* Arrow between steps */}
                {i < steps.length - 1 && (
                  <div className="flex justify-center py-1">
                    <ArrowDown className="w-4 h-4 text-border" />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Step */}
          <button
            onClick={addStep}
            className="w-full py-3 rounded-xl border-2 border-dashed border-border/40 text-muted-foreground hover:text-foreground hover:border-indigo-500/30 hover:bg-indigo-500/5 transition-all flex items-center justify-center gap-2 text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Add Step
          </button>
        </div>
      </div>
      </>
    );
  }

  // ─── Workflow List View ──────────────────────
  return (
    <>
    {runModal && <RunModal workflow={runModal} sessions={sessions} onRun={startRun} onClose={() => setRunModal(null)} />}
    <div className="p-8 h-full overflow-y-auto z-10 relative custom-scrollbar">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
            <p className="text-muted-foreground mt-2">Build multi-agent orchestration pipelines with drag-and-drop steps.</p>
          </div>
          <button
            onClick={() => openEditor()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create Workflow
          </button>
        </div>

        {workflows.length === 0 ? (
          <div className="bg-card/30 border border-dashed border-border/60 rounded-xl p-12 text-center">
            <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
              <GitMerge className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-medium">No workflows yet</h3>
            <p className="text-muted-foreground max-w-md mx-auto mt-2 mb-6">
              Create your first multi-agent orchestration workflow to automate complex tasks across platforms.
            </p>
            <button
              onClick={() => openEditor()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Create First Workflow
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workflows.map(wf => {
              const agentIds = [...new Set(wf.steps.map(s => s.agent))];
              return (
                <div
                  key={wf.id}
                  onClick={() => openEditor(wf)}
                  className="group bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5 cursor-pointer hover:border-indigo-500/30 hover:shadow-lg hover:shadow-indigo-500/5 transition-all"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-lg bg-indigo-500/10">
                        <GitMerge className="w-4 h-4 text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm">{wf.name}</h3>
                        {wf.description && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{wf.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); setRunModal(wf); fetchSessions(); }}
                        className="p-1.5 rounded-md hover:bg-green-500/10 text-muted-foreground hover:text-green-400 transition-colors"
                        title="Run"
                      >
                        <Play className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteWorkflow(wf.id); }}
                        className="p-1.5 rounded-md hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Step preview */}
                  <div className="flex items-center gap-1.5 mb-3">
                    {wf.steps.slice(0, 5).map((step, i) => {
                      const SIcon = AGENT_ICONS[step.agent] || Zap;
                      const sColor = AGENT_COLORS[step.agent] || '#6b7280';
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <div className="p-1 rounded" style={{ backgroundColor: sColor + '15' }}>
                            <SIcon className="w-3 h-3" style={{ color: sColor }} />
                          </div>
                          {i < Math.min(wf.steps.length - 1, 4) && <ArrowRight className="w-2.5 h-2.5 text-border" />}
                        </div>
                      );
                    })}
                    {wf.steps.length > 5 && <span className="text-[10px] text-muted-foreground">+{wf.steps.length - 5}</span>}
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>{wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}</span>
                    <span>{agentIds.length} agent{agentIds.length !== 1 ? 's' : ''}</span>
                    {wf.run_count !== undefined && wf.run_count > 0 && (
                      <span>{wf.run_count} run{wf.run_count !== 1 ? 's' : ''}</span>
                    )}
                    <span>{new Date(wf.updated_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
    </>
  );
}
