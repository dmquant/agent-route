import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, ArrowRight, GitMerge, Play, Save, Trash2, GripVertical,
  Sparkles, Brain, Code, Server, Image, ChevronDown, ChevronRight as ChevronRightIcon,
  FileText, X, Loader2, CheckCircle2, XCircle,
  Clock, AlertTriangle, Zap, Variable,
  ArrowDown, BookOpen, History, GitBranch, SkipForward,
  LayoutGrid, Network,
} from 'lucide-react';
import WorkflowCanvas from '../components/workflow/WorkflowCanvas';
import StepDetailPanel from '../components/workflow/StepDetailPanel';
import {
  type WorkflowStep, type WorkflowEdge, type WorkflowVariable,
  type Workflow, type WorkflowRun, type StepResult,
  type AgentInfo, type SessionInfo,
  AGENT_COLORS, defaultStep, DEFAULT_PORTS,
} from '../components/workflow/types';

const API = 'http://localhost:8000';

// ─── Types re-exported from shared module ──────────────────────
// All type definitions are in ../components/workflow/types.ts

const AGENT_ICONS: Record<string, any> = {
  gemini: Sparkles, claude: Brain, codex: Code,
  ollama: Server, mflux: Image, sub_workflow: GitMerge,
};

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
  const [showCondition, setShowCondition] = useState(
    step.condition && step.condition.type !== 'always'
  );
  const agent = agents.find(a => a.id === step.agent);
  const AgentIcon = AGENT_ICONS[step.agent] || Zap;
  const color = AGENT_COLORS[step.agent] || '#6b7280';
  const hasCondition = step.condition && step.condition.type !== 'always';

  const statusIcon = stepResult ? (
    stepResult.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> :
    stepResult.status === 'error' ? <XCircle className="w-4 h-4 text-red-400" /> :
    stepResult.status === 'timeout' ? <Clock className="w-4 h-4 text-amber-400" /> :
    stepResult.status === 'skipped' ? <SkipForward className="w-4 h-4 text-gray-400" /> :
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
          {hasCondition && <span title="Conditional step"><GitBranch className="w-3 h-3 text-amber-400" /></span>}
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

          {/* Condition Editor (Conditional Branching) */}
          <div>
            <button
              onClick={() => setShowCondition(!showCondition)}
              className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${
                hasCondition ? 'text-amber-400 hover:text-amber-300' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <GitBranch className="w-3 h-3" />
              Condition {hasCondition && <span className="text-[9px] px-1 py-0 rounded bg-amber-500/15 text-amber-400 normal-case capitalize">{step.condition?.type.replace('if_', '').replace(/_/g, ' ')}</span>}
              <ChevronDown className={`w-3 h-3 transition-transform ${showCondition ? '' : '-rotate-90'}`} />
            </button>
            {showCondition && (
              <div className="mt-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-lg space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">When to run</label>
                    <select
                      value={step.condition?.type || 'always'}
                      onChange={e => onUpdate({
                        ...step,
                        condition: { ...(step.condition || { value: '', on_false: 'skip', goto_step: '' }), type: e.target.value as any }
                      })}
                      className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground outline-none"
                    >
                      <option value="always">Always run</option>
                      <option value="if_output_contains">If prev output contains...</option>
                      <option value="if_output_not_contains">If prev output NOT contains...</option>
                      <option value="if_exit_code">If prev exit code equals...</option>
                      <option value="if_file_exists">If file exists in workspace...</option>
                    </select>
                  </div>
                  {step.condition?.type !== 'always' && (
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">
                        {step.condition?.type === 'if_exit_code' ? 'Exit code' :
                         step.condition?.type === 'if_file_exists' ? 'Filename' : 'Search text'}
                      </label>
                      <input
                        value={step.condition?.value || ''}
                        onChange={e => onUpdate({
                          ...step,
                          condition: { ...step.condition!, value: e.target.value }
                        })}
                        placeholder={
                          step.condition?.type === 'if_exit_code' ? '0' :
                          step.condition?.type === 'if_file_exists' ? 'report.md' : 'success'
                        }
                        className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-amber-500/50"
                      />
                    </div>
                  )}
                </div>
                {step.condition?.type !== 'always' && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">If condition fails</label>
                      <select
                        value={step.condition?.on_false || 'skip'}
                        onChange={e => onUpdate({
                          ...step,
                          condition: { ...step.condition!, on_false: e.target.value as any }
                        })}
                        className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground outline-none"
                      >
                        <option value="skip">Skip this step</option>
                        <option value="goto">Jump to step...</option>
                        <option value="stop">Stop workflow</option>
                      </select>
                    </div>
                    {step.condition?.on_false === 'goto' && (
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Goto step ID</label>
                        <input
                          value={step.condition?.goto_step || ''}
                          onChange={e => onUpdate({
                            ...step,
                            condition: { ...step.condition!, goto_step: e.target.value }
                          })}
                          placeholder="step_id"
                          className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground font-mono placeholder:text-muted-foreground/40 outline-none focus:border-amber-500/50"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step Result (when executing) */}
          {stepResult && stepResult.output && (
            <div className="mt-2 p-3 bg-background/40 rounded-lg border border-border/20 max-h-48 overflow-y-auto custom-scrollbar">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-medium text-muted-foreground uppercase">Output</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  stepResult.status === 'success' ? 'bg-green-500/15 text-green-400' :
                  stepResult.status === 'error' ? 'bg-red-500/15 text-red-400' :
                  stepResult.status === 'skipped' ? 'bg-gray-500/15 text-gray-400' : 'bg-muted text-muted-foreground'
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
interface RunInput {
  sessionId: string | null;
  title: string;
  inputPrompt: string;
  inputFiles: { filename: string; content_text: string }[];
  variables: Record<string, string>;
}

function RunModal({ workflow, sessions, onRun, onClose }: {
  workflow: Workflow;
  sessions: SessionInfo[];
  onRun: (input: RunInput) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [selectedSession, setSelectedSession] = useState('');
  const [title, setTitle] = useState(`Workflow: ${workflow.name}`);
  const [inputPrompt, setInputPrompt] = useState('');
  const [inputFiles, setInputFiles] = useState<{ filename: string; content_text: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize variable values from workflow definitions
  const [varValues, setVarValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const v of (workflow.variables || [])) {
      init[v.name] = v.default || '';
    }
    return init;
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      const text = await file.text();
      setInputFiles(prev => [...prev, { filename: file.name, content_text: text }]);
    }
    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (idx: number) => {
    setInputFiles(prev => prev.filter((_, i) => i !== idx));
  };

  const wfVars = workflow.variables || [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border/50 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto custom-scrollbar" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <Play className="w-5 h-5 text-green-400" />
          Run Workflow
        </h3>
        <p className="text-sm text-muted-foreground">
          <strong>{workflow.name}</strong> — {workflow.steps.length} step{workflow.steps.length !== 1 ? 's' : ''}
          {wfVars.length > 0 && <span className="ml-2 text-indigo-400">· {wfVars.length} variable{wfVars.length !== 1 ? 's' : ''}</span>}
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

        {/* Input Prompt */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">
            <Zap className="w-3 h-3 inline mr-1" />
            Input Prompt <span className="text-muted-foreground/50">(optional — injected into first step)</span>
          </label>
          <textarea
            value={inputPrompt}
            onChange={e => setInputPrompt(e.target.value)}
            placeholder="e.g. Analyze NVDA instead of AAPL, focus on AI datacenter revenue..."
            rows={3}
            className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-indigo-500/50 resize-y font-mono"
          />
        </div>

        {/* Input Files */}
        <div>
          <label className="text-xs text-muted-foreground font-medium block mb-1">
            <FileText className="w-3 h-3 inline mr-1" />
            Input Files <span className="text-muted-foreground/50">(optional — uploaded to workspace)</span>
          </label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {inputFiles.map((f, i) => (
              <span key={i} className="flex items-center gap-1 bg-indigo-500/10 border border-indigo-500/20 px-2 py-0.5 rounded-md text-xs text-foreground">
                <FileText className="w-3 h-3 text-indigo-400" />
                {f.filename}
                <span className="text-[10px] text-muted-foreground">({(f.content_text.length / 1024).toFixed(1)}KB)</span>
                <button onClick={() => removeFile(i)} className="ml-0.5 text-muted-foreground hover:text-red-400 transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            onChange={handleFileSelect}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-border transition-colors"
          >
            <Plus className="w-3 h-3" /> Add Files
          </button>
        </div>

        {/* Workflow Variables */}
        {wfVars.length > 0 && (
          <div className="space-y-2">
            <label className="text-xs text-muted-foreground font-medium flex items-center gap-1">
              <Variable className="w-3 h-3" />
              Variables
            </label>
            <div className="space-y-2">
              {wfVars.map(v => (
                <div key={v.name}>
                  <label className="text-xs text-muted-foreground font-medium flex items-center gap-1 mb-1">
                    <code className="text-[10px] px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-400">${'{'}${v.name}{'}'}</code>
                    {v.label || v.name}
                    {v.required && <span className="text-red-400">*</span>}
                  </label>
                  {v.type === 'text' ? (
                    <textarea
                      value={varValues[v.name] || ''}
                      onChange={e => setVarValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={v.default || `Enter ${v.label || v.name}...`}
                      rows={3}
                      className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-indigo-500/50 resize-y font-mono"
                    />
                  ) : (
                    <input
                      type={v.type === 'number' ? 'number' : 'text'}
                      value={varValues[v.name] || ''}
                      onChange={e => setVarValues(prev => ({ ...prev, [v.name]: e.target.value }))}
                      placeholder={v.default || `Enter ${v.label || v.name}...`}
                      className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-indigo-500/50"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-border/50 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
          <button
            onClick={() => onRun({
              sessionId: mode === 'existing' ? selectedSession : null,
              title,
              inputPrompt,
              inputFiles,
              variables: varValues,
            })}
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
  const [wfVariables, setWfVariables] = useState<WorkflowVariable[]>([]);
  const [unsaved, setUnsaved] = useState(false);

  // Drag state (list view)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // DAG state
  const [wfEdges, setWfEdges] = useState<WorkflowEdge[]>([]);
  const [wfPositions, setWfPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'canvas' | 'list'>('canvas');

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
  const normalizeStep = (s: any): WorkflowStep => ({
    id: s.id || crypto.randomUUID(),
    name: s.name || s.id || '',
    agent: s.agent || 'gemini',
    prompt: s.prompt || '',
    skills: Array.isArray(s.skills) ? s.skills : [],
    // API uses snake_case 'input_files', UI uses camelCase 'inputFiles'
    inputFiles: Array.isArray(s.inputFiles) ? s.inputFiles
      : Array.isArray(s.input_files) ? s.input_files : [],
    inputs: Array.isArray(s.inputs) && s.inputs.length > 0
      ? s.inputs : [...DEFAULT_PORTS.inputs],
    outputs: Array.isArray(s.outputs) && s.outputs.length > 0
      ? s.outputs : [...DEFAULT_PORTS.outputs],
    sub_workflow_id: s.sub_workflow_id || undefined,
    condition: s.condition ? {
      type: s.condition.type || 'always',
      value: s.condition.value || '',
      on_false: s.condition.on_false || 'skip',
      goto_step: s.condition.goto_step || '',
    } : { type: 'always', value: '', on_false: 'skip', goto_step: '' },
    config: {
      timeout: s.config?.timeout ?? s.timeout ?? 3600,
      continue_on_error: s.config?.continue_on_error ?? false,
    },
  });

  const openEditor = (wf?: Workflow) => {
    if (wf) {
      setEditing(wf);
      const normalized = wf.steps.map(normalizeStep);
      setSteps(normalized);
      setWfName(wf.name);
      setWfDesc(wf.description);
      setWfVariables(wf.variables || []);
      setWfEdges(wf.edges || []);
      setWfPositions(wf.positions || {});
    } else {
      const firstStep = defaultStep();
      setEditing({
        id: '', name: 'New Workflow', description: '',
        steps: [], edges: [], variables: [], positions: {},
        config: {}, created_at: 0, updated_at: 0,
      } as Workflow);
      setSteps([firstStep]);
      setWfName('New Workflow');
      setWfDesc('');
      setWfVariables([]);
      setWfEdges([]);
      setWfPositions({});
    }
    setSelectedStepId(null);
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

  // Canvas: add a new step node with agent and optional position
  const handleAddStepCanvas = useCallback((agent: string, position?: { x: number; y: number }) => {
    const newStep = defaultStep();
    newStep.agent = agent;
    if (agent === 'sub_workflow') {
      newStep.name = 'Sub-Workflow';
    }
    const pos = position || { x: steps.length * 300, y: 0 };
    const newSteps = [...steps, newStep];
    setSteps(newSteps);
    setWfPositions(prev => ({ ...prev, [newStep.id]: pos }));

    // Auto-connect to last step if exists
    if (steps.length > 0) {
      const lastStep = steps[steps.length - 1];
      const newEdge: WorkflowEdge = {
        id: `e-${lastStep.id}-${newStep.id}`,
        source: lastStep.id,
        sourceHandle: 'output',
        target: newStep.id,
        targetHandle: 'input',
      };
      setWfEdges(prev => [...prev, newEdge]);
    }

    setSelectedStepId(newStep.id);
    setUnsaved(true);
  }, [steps]);

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
          body: JSON.stringify({ name: wfName, description: wfDesc, steps, edges: wfEdges, positions: wfPositions, variables: wfVariables }),
        });
        const updated = await res.json();
        setEditing(updated);
      } else {
        // Create
        const res = await fetch(`${API}/api/workflows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: wfName, description: wfDesc, steps, edges: wfEdges, positions: wfPositions, variables: wfVariables }),
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
  const startRun = async (input: RunInput) => {
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
          session_id: input.sessionId || undefined,
          session_title: input.title,
          input_prompt: input.inputPrompt || undefined,
          input_files: input.inputFiles.length > 0 ? input.inputFiles : undefined,
          variables: Object.keys(input.variables).length > 0 ? input.variables : undefined,
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
      <div className="flex flex-col h-full z-10 relative">
        <div className="p-6 pb-2 shrink-0">
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
              {/* View Mode Toggle */}
              <div className="flex items-center bg-card border border-border/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => setViewMode('canvas')}
                  className={`p-2 transition-colors ${viewMode === 'canvas' ? 'bg-indigo-500/20 text-indigo-400' : 'text-muted-foreground hover:text-foreground'}`}
                  title="DAG Canvas View"
                >
                  <Network className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 transition-colors ${viewMode === 'list' ? 'bg-indigo-500/20 text-indigo-400' : 'text-muted-foreground hover:text-foreground'}`}
                  title="List View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
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

          {/* Variables Panel */}
          <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Variable className="w-4 h-4 text-purple-400" />
                Variables
                {wfVariables.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-medium">{wfVariables.length}</span>
                )}
              </h3>
              <button
                onClick={() => {
                  setWfVariables([...wfVariables, { name: '', label: '', type: 'string', default: '', required: false }]);
                  setUnsaved(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-dashed border-border/50 text-xs text-muted-foreground hover:text-foreground hover:border-purple-500/30 transition-colors"
              >
                <Plus className="w-3 h-3" /> Add Variable
              </button>
            </div>
            {wfVariables.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">
                No variables defined. Add variables to use <code className="text-[10px] px-1 py-0.5 rounded bg-purple-500/10 text-purple-400">{'${VAR_NAME}'}</code> placeholders in step prompts.
              </p>
            ) : (
              <div className="space-y-2">
                {wfVariables.map((v, vi) => (
                  <div key={vi} className="flex items-start gap-2 bg-background/40 border border-border/30 rounded-lg p-2.5">
                    <div className="flex-1 grid grid-cols-4 gap-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Name</label>
                        <input
                          value={v.name}
                          onChange={e => {
                            const updated = [...wfVariables];
                            updated[vi] = { ...v, name: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') };
                            setWfVariables(updated); setUnsaved(true);
                          }}
                          placeholder="TICKER"
                          className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-purple-500/50 font-mono"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Label</label>
                        <input
                          value={v.label}
                          onChange={e => {
                            const updated = [...wfVariables];
                            updated[vi] = { ...v, label: e.target.value };
                            setWfVariables(updated); setUnsaved(true);
                          }}
                          placeholder="Stock Ticker"
                          className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Default</label>
                        <input
                          value={v.default}
                          onChange={e => {
                            const updated = [...wfVariables];
                            updated[vi] = { ...v, default: e.target.value };
                            setWfVariables(updated); setUnsaved(true);
                          }}
                          placeholder="NVDA"
                          className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-purple-500/50"
                        />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Type</label>
                          <select
                            value={v.type}
                            onChange={e => {
                              const updated = [...wfVariables];
                              updated[vi] = { ...v, type: e.target.value as any };
                              setWfVariables(updated); setUnsaved(true);
                            }}
                            className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground outline-none"
                          >
                            <option value="string">String</option>
                            <option value="number">Number</option>
                            <option value="text">Text (multi)</option>
                          </select>
                        </div>
                        <label className="flex items-center gap-1 text-[10px] text-muted-foreground pb-0.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={v.required}
                            onChange={e => {
                              const updated = [...wfVariables];
                              updated[vi] = { ...v, required: e.target.checked };
                              setWfVariables(updated); setUnsaved(true);
                            }}
                            className="w-3 h-3 rounded"
                          />
                          Req
                        </label>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setWfVariables(wfVariables.filter((_, i) => i !== vi));
                        setUnsaved(true);
                      }}
                      className="p-1 rounded text-muted-foreground hover:text-red-400 transition-colors mt-4"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Canvas View ── */}
      {viewMode === 'canvas' && (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 relative" style={{ minHeight: '500px' }}>
            <WorkflowCanvas
              steps={steps}
              edges={wfEdges}
              positions={wfPositions}
              agents={agents}
              workflows={workflows}
              activeRun={activeRun}
              selectedStepId={selectedStepId}
              onStepsChange={s => { setSteps(s); setUnsaved(true); }}
              onEdgesChange={e => { setWfEdges(e); setUnsaved(true); }}
              onPositionsChange={p => { setWfPositions(p); }}
              onSelectStep={setSelectedStepId}
              onAddStep={handleAddStepCanvas}
            />
          </div>
          {selectedStepId && steps.find(s => s.id === selectedStepId) && (
            <StepDetailPanel
              step={steps.find(s => s.id === selectedStepId)!}
              agents={agents}
              workflows={workflows}
              currentWorkflowId={editing?.id}
              edges={wfEdges}
              steps={steps}
              stepResult={activeRun?.results?.find((r: any) => r.step_id === selectedStepId)}
              allResults={activeRun?.results || []}
              onUpdate={(updated) => {
                setSteps(steps.map(s => s.id === updated.id ? updated : s));
                setUnsaved(true);
              }}
              onDelete={() => {
                setSteps(steps.filter(s => s.id !== selectedStepId));
                setWfEdges(wfEdges.filter(e => e.source !== selectedStepId && e.target !== selectedStepId));
                const newPos = { ...wfPositions };
                delete newPos[selectedStepId];
                setWfPositions(newPos);
                setSelectedStepId(null);
                setUnsaved(true);
              }}
              onClose={() => setSelectedStepId(null)}
            />
          )}
        </div>
      )}

      {/* ── List View (original) ── */}
      {viewMode === 'list' && (
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          <div className="max-w-4xl mx-auto space-y-3">
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
      )}
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
