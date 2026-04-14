// ─── Workflow DAG Types ──────────────────────

export interface StepCondition {
  type: 'always' | 'if_output_contains' | 'if_output_not_contains' | 'if_exit_code' | 'if_file_exists';
  value: string;
  on_false: 'skip' | 'goto' | 'stop';
  goto_step: string;
}

export interface StepPort {
  id: string;
  label: string;
  type: 'text' | 'file' | 'json' | 'context';
}

export interface WorkflowStep {
  id: string;
  name: string;
  agent: string;
  prompt: string;
  skills: string[];
  inputFiles: string[];
  condition?: StepCondition;
  inputs: StepPort[];
  outputs: StepPort[];
  sub_workflow_id?: string;
  config: {
    timeout: number;
    continue_on_error: boolean;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  sourceHandle: string;
  target: string;
  targetHandle: string;
  condition?: StepCondition;
  label?: string;
}

export interface WorkflowVariable {
  name: string;
  label: string;
  type: 'string' | 'number' | 'text';
  default: string;
  required: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  variables: WorkflowVariable[];
  positions: Record<string, { x: number; y: number }>;
  config: Record<string, any>;
  created_at: number;
  updated_at: number;
  run_count?: number;
}

export interface WorkflowRun {
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

export interface StepResult {
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

export interface AgentInfo {
  id: string;
  name: string;
  color: string;
  icon: string;
  capabilities: string[];
  skills: { id: string; name: string; description: string }[];
  status: string;
}

export interface SessionInfo {
  id: string;
  title: string;
  agent_type: string;
  message_count: number;
}

export const AGENT_COLORS: Record<string, string> = {
  gemini: '#4285f4', claude: '#d97706', codex: '#10b981',
  ollama: '#8b5cf6', mflux: '#ec4899', sub_workflow: '#6366f1',
};

export const DEFAULT_PORTS: { inputs: StepPort[]; outputs: StepPort[] } = {
  inputs: [{ id: 'input', label: 'Input', type: 'context' }],
  outputs: [{ id: 'output', label: 'Output', type: 'text' }],
};

export const defaultStep = (_position?: { x: number; y: number }): WorkflowStep => ({
  id: crypto.randomUUID(),
  name: '',
  agent: 'gemini',
  prompt: '',
  skills: [],
  inputFiles: [],
  inputs: [...DEFAULT_PORTS.inputs],
  outputs: [...DEFAULT_PORTS.outputs],
  condition: { type: 'always', value: '', on_false: 'skip', goto_step: '' },
  config: { timeout: 3600, continue_on_error: false },
});
