import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Sparkles, Brain, Code, Server, Image, Zap,
  CheckCircle2, XCircle, Loader2, Clock, SkipForward,
  GitBranch, GitMerge, Activity,
} from 'lucide-react';
import { AGENT_COLORS, type WorkflowStep, type StepResult } from './types';

const AGENT_ICONS: Record<string, any> = {
  gemini: Sparkles, claude: Brain, codex: Code,
  ollama: Server, mflux: Image, sub_workflow: GitMerge,
};

/* Lighter tint backgrounds for each agent type */
const AGENT_BG_TINT: Record<string, string> = {
  gemini: '#eef4ff',   // soft blue
  claude: '#fef7ed',   // soft amber
  codex: '#ecfdf5',    // soft green
  ollama: '#f3f0ff',   // soft violet
  mflux: '#fdf2f8',    // soft pink
  sub_workflow: '#eef2ff', // soft indigo
};

interface StepNodeData {
  step: WorkflowStep;
  index: number;
  isExecuting: boolean;
  stepResult?: StepResult;
  onSelect: (stepId: string) => void;
  selected?: boolean;
}

function StepNodeComponent({ data, selected }: NodeProps & { data: StepNodeData }) {
  const { step, index, isExecuting, stepResult, onSelect } = data;
  const AgentIcon = AGENT_ICONS[step.agent] || Zap;
  const color = AGENT_COLORS[step.agent] || '#6b7280';
  const bgTint = AGENT_BG_TINT[step.agent] || '#f9fafb';
  const hasCondition = step.condition && step.condition.type !== 'always';
  const isSubWorkflow = step.agent === 'sub_workflow';

  // Status badge
  const statusIcon = stepResult ? (
    stepResult.status === 'success' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> :
    stepResult.status === 'error' ? <XCircle className="w-3.5 h-3.5 text-red-500" /> :
    stepResult.status === 'timeout' ? <Clock className="w-3.5 h-3.5 text-amber-500" /> :
    stepResult.status === 'skipped' ? <SkipForward className="w-3.5 h-3.5 text-gray-400" /> :
    null
  ) : isExecuting ? (
    <div className="relative">
      <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
    </div>
  ) : null;

  // Dynamic border styling
  const executionClasses = isExecuting
    ? 'ring-2 ring-indigo-400 shadow-lg shadow-indigo-200 animate-[pulse_2s_ease-in-out_infinite]'
    : stepResult?.status === 'success'
    ? 'ring-1 ring-emerald-400 shadow-md shadow-emerald-100'
    : stepResult?.status === 'error'
    ? 'ring-1 ring-red-400 shadow-md shadow-red-100'
    : stepResult?.status === 'skipped'
    ? 'opacity-50'
    : '';

  const selectionClasses = selected || data.selected
    ? 'ring-2 ring-indigo-400 shadow-lg shadow-indigo-100'
    : 'hover:shadow-lg hover:shadow-gray-200/60';

  return (
    <div
      className={`step-node relative rounded-xl border border-gray-200 transition-all duration-200 cursor-pointer min-w-[220px] max-w-[280px] ${selectionClasses} ${executionClasses}`}
      style={{ background: '#ffffff' }}
      onClick={() => onSelect(step.id)}
    >
      {/* Execution progress shimmer */}
      {isExecuting && (
        <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl overflow-hidden">
          <div
            className="h-full rounded-t-xl animate-[shimmer_1.5s_ease-in-out_infinite]"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${color} 50%, transparent 100%)`,
              backgroundSize: '200% 100%',
            }}
          />
        </div>
      )}

      {/* Input handles */}
      {step.inputs.map((port, i) => (
        <Handle
          key={`in-${port.id}`}
          type="target"
          position={Position.Left}
          id={port.id}
          style={{
            top: `${((i + 1) / (step.inputs.length + 1)) * 100}%`,
            background: '#3b82f6',
            width: 10,
            height: 10,
            border: '2px solid #ffffff',
            boxShadow: '0 0 0 1px #e5e7eb',
            transition: 'all 0.2s ease',
          }}
          title={`${port.label} (${port.type})`}
        />
      ))}

      {/* Output handles */}
      {step.outputs.map((port, i) => (
        <Handle
          key={`out-${port.id}`}
          type="source"
          position={Position.Right}
          id={port.id}
          style={{
            top: `${((i + 1) / (step.outputs.length + 1)) * 100}%`,
            background: '#10b981',
            width: 10,
            height: 10,
            border: '2px solid #ffffff',
            boxShadow: '0 0 0 1px #e5e7eb',
            transition: 'all 0.2s ease',
          }}
          title={`${port.label} (${port.type})`}
        />
      ))}

      {/* Header bar with agent color */}
      <div
        className="h-1 rounded-t-xl"
        style={{
          background: isExecuting
            ? `linear-gradient(90deg, ${color}, ${color}cc, ${color})`
            : stepResult?.status === 'success'
            ? '#10b981'
            : stepResult?.status === 'error'
            ? '#ef4444'
            : color,
        }}
      />

      {/* Node body */}
      <div className="p-3 space-y-2">
        {/* Top row: icon + name + status */}
        <div className="flex items-center gap-2">
          <div
            className={`p-1.5 rounded-lg shrink-0 transition-all duration-200 ${isExecuting ? 'animate-pulse' : ''}`}
            style={{ backgroundColor: bgTint }}
          >
            <AgentIcon className="w-3.5 h-3.5" style={{ color }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1">
              <span className="text-xs font-semibold text-gray-900 truncate">
                {step.name || `Step ${index + 1}`}
              </span>
              {hasCondition && <GitBranch className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
            </div>
            <span className="text-[10px] text-gray-500 capitalize font-medium">{step.agent.replace('_', ' ')}</span>
          </div>
          {statusIcon}
        </div>

        {/* Execution activity indicator */}
        {isExecuting && (
          <div className="flex items-center gap-1.5 text-[10px] text-indigo-600 bg-indigo-50 px-2 py-1 rounded-md border border-indigo-100">
            <Activity className="w-2.5 h-2.5 animate-pulse" />
            <span className="font-semibold">Executing…</span>
          </div>
        )}

        {/* Prompt preview */}
        {step.prompt && !isExecuting && (
          <div
            className="text-[10px] text-gray-600 line-clamp-2 font-mono leading-relaxed rounded-md px-2 py-1.5 border"
            style={{ backgroundColor: bgTint, borderColor: `${color}18` }}
          >
            {step.prompt.slice(0, 100)}{step.prompt.length > 100 ? '…' : ''}
          </div>
        )}

        {/* Sub-workflow indicator */}
        {isSubWorkflow && step.sub_workflow_id && (
          <div className="flex items-center gap-1 text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
            <GitMerge className="w-2.5 h-2.5" />
            <span className="truncate font-medium">Sub-workflow</span>
          </div>
        )}

        {/* Port labels */}
        <div className="flex justify-between text-[9px]">
          <div className="flex flex-col gap-0.5">
            {step.inputs.map(p => (
              <span key={p.id} className="flex items-center gap-1 text-blue-500 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                {p.label}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-0.5 items-end">
            {step.outputs.map(p => (
              <span key={p.id} className="flex items-center gap-1 text-emerald-500 font-medium">
                {p.label}
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              </span>
            ))}
          </div>
        </div>

        {/* Execution result summary */}
        {stepResult?.latency_ms && (
          <div className={`flex items-center justify-between text-[9px] font-medium tabular-nums pt-0.5 border-t border-gray-100 ${
            stepResult.status === 'success' ? 'text-emerald-600' :
            stepResult.status === 'error' ? 'text-red-600' :
            'text-gray-400'
          }`}>
            <span className="uppercase tracking-wide">{stepResult.status}</span>
            <span>{(stepResult.latency_ms / 1000).toFixed(1)}s</span>
          </div>
        )}
      </div>
    </div>
  );
}

export const StepNode = memo(StepNodeComponent);
