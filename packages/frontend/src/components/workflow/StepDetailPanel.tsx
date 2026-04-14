import { useState } from 'react';
import {
  X, Sparkles, Brain, Code, Server, Image, Zap,
  Plus, Trash2, ChevronDown, BookOpen, FileText,
  GitBranch, GitMerge, Eye, Copy, Check,
  ArrowDownRight, ArrowUpRight,
} from 'lucide-react';
import {
  type WorkflowStep, type AgentInfo, type Workflow,
  type StepResult, type WorkflowEdge,
  AGENT_COLORS,
} from './types';

const AGENT_ICONS: Record<string, any> = {
  gemini: Sparkles, claude: Brain, codex: Code,
  ollama: Server, mflux: Image, sub_workflow: GitMerge,
};

const PORT_TYPES = ['text', 'file', 'json', 'context'] as const;

interface StepDetailPanelProps {
  step: WorkflowStep;
  agents: AgentInfo[];
  workflows: Workflow[];  // For sub-workflow selector
  currentWorkflowId?: string;
  edges?: WorkflowEdge[];     // For context inspector
  steps?: WorkflowStep[];     // For context inspector
  stepResult?: StepResult;    // For context inspector
  allResults?: StepResult[];  // For context inspector
  onUpdate: (step: WorkflowStep) => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function StepDetailPanel({
  step, agents, workflows, currentWorkflowId,
  edges = [], steps = [], stepResult, allResults = [],
  onUpdate, onDelete, onClose,
}: StepDetailPanelProps) {
  const [showSkills, setShowSkills] = useState(false);
  const [showCondition, setShowCondition] = useState(
    step.condition && step.condition.type !== 'always'
  );
  const [showPorts, setShowPorts] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const agent = agents.find(a => a.id === step.agent);
  const color = AGENT_COLORS[step.agent] || '#6b7280';
  const AgentIcon = AGENT_ICONS[step.agent] || Zap;
  const isSubWorkflow = step.agent === 'sub_workflow';
  const hasCondition = step.condition && step.condition.type !== 'always';

  // Available sub-workflows (exclude self)
  const availableSubWorkflows = workflows.filter(w => w.id !== currentWorkflowId);

  // Context inspector data
  const incomingEdges = edges.filter(e => e.target === step.id);
  const outgoingEdges = edges.filter(e => e.source === step.id);
  const parentSteps = incomingEdges.map(e => {
    const parent = steps.find(s => s.id === e.source);
    const parentResult = allResults.find(r => r.step_id === e.source);
    return { edge: e, step: parent, result: parentResult };
  });

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <div className="w-80 bg-card/95 backdrop-blur-xl border-l border-border/50 h-full overflow-y-auto custom-scrollbar">
      {/* Header */}
      <div className="sticky top-0 bg-card/95 backdrop-blur-xl z-10 border-b border-border/30 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg" style={{ backgroundColor: color + '20' }}>
            <AgentIcon className="w-4 h-4" style={{ color }} />
          </div>
          <span className="text-sm font-semibold">Step Details</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onDelete}
            className="p-1.5 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
            title="Delete step"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Name */}
        <div>
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">Name</label>
          <input
            value={step.name}
            onChange={e => onUpdate({ ...step, name: e.target.value })}
            placeholder="Step name"
            className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-indigo-500/50"
          />
        </div>

        {/* Agent selector */}
        <div>
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">Agent</label>
          <div className="flex gap-1.5 flex-wrap">
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
                  style={isSelected ? { color: a.color || AGENT_COLORS[a.id], borderColor: (a.color || AGENT_COLORS[a.id]) + '50' } : {}}
                >
                  <AIcon className="w-3 h-3" />
                  {a.name.split(' ')[0]}
                </button>
              );
            })}
            {/* Sub-workflow button */}
            <button
              onClick={() => onUpdate({ ...step, agent: 'sub_workflow', skills: [] })}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all border ${
                isSubWorkflow
                  ? 'border-indigo-500/50 bg-indigo-500/10 text-indigo-400 shadow-sm'
                  : 'border-border/30 text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              <GitMerge className="w-3 h-3" />
              Sub-Flow
            </button>
          </div>
        </div>

        {/* Sub-workflow selector */}
        {isSubWorkflow && (
          <div>
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">Sub-Workflow</label>
            <select
              value={step.sub_workflow_id || ''}
              onChange={e => onUpdate({ ...step, sub_workflow_id: e.target.value })}
              className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-indigo-500/50"
            >
              <option value="">Select a workflow…</option>
              {availableSubWorkflows.map(w => (
                <option key={w.id} value={w.id}>{w.name} ({w.steps.length} steps)</option>
              ))}
            </select>
          </div>
        )}

        {/* Prompt (not for sub-workflow) */}
        {!isSubWorkflow && (
          <div>
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-1">Prompt</label>
            <textarea
              value={step.prompt}
              onChange={e => onUpdate({ ...step, prompt: e.target.value })}
              placeholder="Enter the task prompt for this step..."
              rows={5}
              className="w-full bg-background/60 border border-border/40 rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-indigo-500/50 resize-y font-mono"
            />
          </div>
        )}

        {/* Skills */}
        {!isSubWorkflow && agent && agent.skills.length > 0 && (
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
              <div className="grid gap-1.5 mt-2 max-h-32 overflow-y-auto custom-scrollbar">
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

        {/* I/O Ports */}
        <div>
          <button
            onClick={() => setShowPorts(!showPorts)}
            className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${
              showPorts ? 'text-cyan-400' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <GitBranch className="w-3 h-3" />
            I/O Ports ({step.inputs.length} in, {step.outputs.length} out)
            <ChevronDown className={`w-3 h-3 transition-transform ${showPorts ? '' : '-rotate-90'}`} />
          </button>
          {showPorts && (
            <div className="mt-2 space-y-3">
              {/* Inputs */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-blue-400 font-medium">Inputs</span>
                  <button
                    onClick={() => onUpdate({
                      ...step,
                      inputs: [...step.inputs, { id: `in_${Date.now()}`, label: 'New Input', type: 'context' }]
                    })}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                  ><Plus className="w-2.5 h-2.5" /> Add</button>
                </div>
                {step.inputs.map((port, pi) => (
                  <div key={port.id} className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <input
                      value={port.label}
                      onChange={e => {
                        const newInputs = [...step.inputs];
                        newInputs[pi] = { ...port, label: e.target.value };
                        onUpdate({ ...step, inputs: newInputs });
                      }}
                      className="flex-1 bg-background/40 border border-border/20 rounded px-2 py-0.5 text-[10px] text-foreground outline-none"
                    />
                    <select
                      value={port.type}
                      onChange={e => {
                        const newInputs = [...step.inputs];
                        newInputs[pi] = { ...port, type: e.target.value as any };
                        onUpdate({ ...step, inputs: newInputs });
                      }}
                      className="bg-background/40 border border-border/20 rounded px-1 py-0.5 text-[10px] text-foreground outline-none"
                    >
                      {PORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {step.inputs.length > 1 && (
                      <button onClick={() => {
                        onUpdate({ ...step, inputs: step.inputs.filter((_, i) => i !== pi) });
                      }} className="text-muted-foreground hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                    )}
                  </div>
                ))}
              </div>
              {/* Outputs */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] text-green-400 font-medium">Outputs</span>
                  <button
                    onClick={() => onUpdate({
                      ...step,
                      outputs: [...step.outputs, { id: `out_${Date.now()}`, label: 'New Output', type: 'text' }]
                    })}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                  ><Plus className="w-2.5 h-2.5" /> Add</button>
                </div>
                {step.outputs.map((port, pi) => (
                  <div key={port.id} className="flex items-center gap-1.5 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    <input
                      value={port.label}
                      onChange={e => {
                        const newOutputs = [...step.outputs];
                        newOutputs[pi] = { ...port, label: e.target.value };
                        onUpdate({ ...step, outputs: newOutputs });
                      }}
                      className="flex-1 bg-background/40 border border-border/20 rounded px-2 py-0.5 text-[10px] text-foreground outline-none"
                    />
                    <select
                      value={port.type}
                      onChange={e => {
                        const newOutputs = [...step.outputs];
                        newOutputs[pi] = { ...port, type: e.target.value as any };
                        onUpdate({ ...step, outputs: newOutputs });
                      }}
                      className="bg-background/40 border border-border/20 rounded px-1 py-0.5 text-[10px] text-foreground outline-none"
                    >
                      {PORT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {step.outputs.length > 1 && (
                      <button onClick={() => {
                        onUpdate({ ...step, outputs: step.outputs.filter((_, i) => i !== pi) });
                      }} className="text-muted-foreground hover:text-red-400"><X className="w-2.5 h-2.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Context Inspector */}
        <div>
          <button
            onClick={() => setShowContext(!showContext)}
            className={`flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider transition-colors ${
              showContext ? 'text-purple-400' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Eye className="w-3 h-3" />
            Context Inspector
            {(incomingEdges.length > 0 || stepResult) && (
              <span className="text-[9px] px-1 py-0 rounded bg-purple-500/15 text-purple-400 normal-case">
                {incomingEdges.length} in · {outgoingEdges.length} out
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showContext ? '' : '-rotate-90'}`} />
          </button>
          {showContext && (
            <div className="mt-2 space-y-3">
              {/* Incoming data */}
              {parentSteps.length > 0 && (
                <div>
                  <div className="text-[10px] text-blue-400 font-medium flex items-center gap-1 mb-1">
                    <ArrowDownRight className="w-3 h-3" />
                    Incoming Data
                  </div>
                  {parentSteps.map(({ edge, step: parent, result: parentResult }) => (
                    <div key={edge.id} className="mb-2 p-2 bg-blue-500/5 border border-blue-500/10 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-foreground font-medium truncate">
                          {parent?.name || edge.source.slice(0, 8)}
                        </span>
                        <span className="text-[9px] text-muted-foreground">
                          {edge.sourceHandle || 'output'} → {edge.targetHandle || 'input'}
                        </span>
                      </div>
                      {parentResult?.output ? (
                        <div className="relative">
                          <pre className="text-[9px] text-muted-foreground/70 font-mono bg-background/30 rounded px-2 py-1 max-h-16 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-all">
                            {parentResult.output.slice(0, 500)}{parentResult.output.length > 500 ? '…' : ''}
                          </pre>
                          <button
                            onClick={() => copyToClipboard(parentResult.output!, `in-${edge.id}`)}
                            className="absolute top-1 right-1 p-0.5 rounded bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy output"
                          >
                            {copiedField === `in-${edge.id}` ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[9px] text-muted-foreground/40 italic">No data yet</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* This step's output */}
              <div>
                <div className="text-[10px] text-green-400 font-medium flex items-center gap-1 mb-1">
                  <ArrowUpRight className="w-3 h-3" />
                  Output Data
                </div>
                {stepResult?.output ? (
                  <div className="relative p-2 bg-green-500/5 border border-green-500/10 rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-[10px] font-medium ${
                        stepResult.status === 'success' ? 'text-emerald-400' :
                        stepResult.status === 'error' ? 'text-red-400' :
                        'text-muted-foreground'
                      }`}>
                        {stepResult.status} {stepResult.latency_ms ? `· ${(stepResult.latency_ms / 1000).toFixed(1)}s` : ''}
                      </span>
                      <button
                        onClick={() => copyToClipboard(stepResult.output!, 'output')}
                        className="p-0.5 rounded bg-background/60 text-muted-foreground hover:text-foreground transition-colors"
                        title="Copy output"
                      >
                        {copiedField === 'output' ? <Check className="w-2.5 h-2.5 text-emerald-400" /> : <Copy className="w-2.5 h-2.5" />}
                      </button>
                    </div>
                    <pre className="text-[9px] text-muted-foreground/70 font-mono bg-background/30 rounded px-2 py-1 max-h-24 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-all">
                      {stepResult.output.slice(0, 1000)}{stepResult.output.length > 1000 ? '…' : ''}
                    </pre>
                  </div>
                ) : (
                  <div className="p-2 bg-background/20 border border-border/10 rounded-lg">
                    <span className="text-[9px] text-muted-foreground/40 italic">
                      {outgoingEdges.length > 0
                        ? `Output feeds ${outgoingEdges.length} downstream node(s)`
                        : 'No output data (run workflow first)'
                      }
                    </span>
                  </div>
                )}
              </div>

              {/* Connected downstream nodes */}
              {outgoingEdges.length > 0 && (
                <div>
                  <div className="text-[10px] text-muted-foreground font-medium mb-1">
                    Feeds Into:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {outgoingEdges.map(e => {
                      const target = steps.find(s => s.id === e.target);
                      return (
                        <span key={e.id} className="text-[9px] px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-border/10">
                          {target?.name || e.target.slice(0, 8)}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Condition Editor */}
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
                  <option value="if_output_contains">If prev output contains…</option>
                  <option value="if_output_not_contains">If prev output NOT contains…</option>
                  <option value="if_exit_code">If prev exit code equals…</option>
                  <option value="if_file_exists">If file exists…</option>
                </select>
              </div>
              {step.condition?.type !== 'always' && (
                <>
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
                      placeholder={step.condition?.type === 'if_exit_code' ? '0' : step.condition?.type === 'if_file_exists' ? 'report.md' : 'success'}
                      className="w-full bg-background/60 border border-border/40 rounded px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground/40 outline-none"
                    />
                  </div>
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
                      <option value="goto">Jump to step…</option>
                      <option value="stop">Stop workflow</option>
                    </select>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Input Files */}
        {!isSubWorkflow && (
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
                    onUpdate({ ...step, inputFiles: step.inputFiles.filter((_, i) => i !== fi) });
                  }} className="text-muted-foreground hover:text-red-400">
                    <X className="w-2.5 h-2.5" />
                  </button>
                </span>
              ))}
              <button
                onClick={() => {
                  const name = prompt('Enter filename:');
                  if (name) onUpdate({ ...step, inputFiles: [...step.inputFiles, name] });
                }}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-dashed border-border/40 text-[11px] text-muted-foreground hover:text-foreground hover:border-border transition-colors"
              >
                <Plus className="w-2.5 h-2.5" /> Add
              </button>
            </div>
          </div>
        )}

        {/* Config */}
        <div className="space-y-2">
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block">Config</label>
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
        </div>

        {/* Step ID (read-only) */}
        <div>
          <label className="text-[10px] text-muted-foreground font-medium block mb-0.5">Step ID</label>
          <code className="text-[10px] text-muted-foreground/60 font-mono bg-background/30 px-2 py-1 rounded block truncate">
            {step.id}
          </code>
        </div>
      </div>
    </div>
  );
}
