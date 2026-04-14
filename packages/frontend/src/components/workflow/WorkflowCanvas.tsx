import { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  BackgroundVariant,
  MarkerType,
  Panel,
  type OnNodesChange,
  type OnEdgesChange,
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  Sparkles, Brain, Code, Server, Image, GitMerge,
  Layout, Zap, AlertTriangle, Check,
} from 'lucide-react';
import { StepNode } from './StepNode';
import {
  type WorkflowStep, type WorkflowEdge, type StepResult,
  type AgentInfo, type Workflow,
  AGENT_COLORS,
} from './types';

const AGENT_ICONS: Record<string, any> = {
  gemini: Sparkles, claude: Brain, codex: Code,
  ollama: Server, mflux: Image, sub_workflow: GitMerge,
};

const nodeTypes = { stepNode: StepNode };

// ─── Cycle Detection (Client-Side) ─────
function detectCycle(
  stepIds: Set<string>,
  edges: { source: string; target: string }[]
): { hasCycle: boolean; cycleNodes: Set<string> } {
  const adjacency: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  for (const id of stepIds) {
    adjacency[id] = [];
    inDegree[id] = 0;
  }
  for (const e of edges) {
    if (stepIds.has(e.source) && stepIds.has(e.target)) {
      adjacency[e.source].push(e.target);
      inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    }
  }
  const queue: string[] = [];
  for (const id of stepIds) {
    if ((inDegree[id] || 0) === 0) queue.push(id);
  }
  const visited = new Set<string>();
  while (queue.length > 0) {
    const node = queue.shift()!;
    visited.add(node);
    for (const child of adjacency[node]) {
      inDegree[child]--;
      if (inDegree[child] === 0) queue.push(child);
    }
  }
  const cycleNodes = new Set<string>();
  for (const id of stepIds) {
    if (!visited.has(id)) cycleNodes.add(id);
  }
  return { hasCycle: cycleNodes.size > 0, cycleNodes };
}

// ─── Custom Animated Edge with Data Label ─────
function DataFlowEdge({
  id: _id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  data, style, markerEnd, label, labelStyle, labelBgStyle,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    borderRadius: 16,
  });

  const isConditional = data?.isConditional;
  const isRunning = data?.isRunning;

  return (
    <>
      {/* Glow effect when running */}
      {isRunning && (
        <BaseEdge
          path={edgePath}
          style={{
            ...style,
            strokeWidth: 6,
            stroke: isConditional ? '#fbbf2440' : '#6366f140',
            filter: 'blur(3px)',
          }}
        />
      )}
      <BaseEdge
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          strokeDasharray: isRunning ? '8 4' : undefined,
          animation: isRunning ? 'dash-flow 0.8s linear infinite' : undefined,
        }}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'none',
            }}
          >
            <div
              className="text-[9px] font-medium px-1.5 py-0.5 rounded-md border backdrop-blur-sm whitespace-nowrap"
              style={{
                ...labelBgStyle,
                color: (labelStyle as any)?.fill || '#64748b',
                borderColor: isConditional ? '#fbbf2440' : '#e2e8f0',
                background: '#ffffff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}
            >
              {label as string}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { dataFlow: DataFlowEdge };


// ─── Auto-layout (simple layered) ─────
function autoLayout(
  steps: WorkflowStep[],
  edges: WorkflowEdge[],
  existingPositions?: Record<string, { x: number; y: number }>,
): Record<string, { x: number; y: number }> {
  if (existingPositions && Object.keys(existingPositions).length === steps.length) {
    return existingPositions;
  }

  // Build adjacency for layers
  const inDegree: Record<string, number> = {};
  const children: Record<string, string[]> = {};
  for (const s of steps) {
    inDegree[s.id] = 0;
    children[s.id] = [];
  }
  for (const e of edges) {
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
    if (children[e.source]) children[e.source].push(e.target);
  }

  // Kahn's algo for layers
  const layers: string[][] = [];
  let queue = steps.filter(s => (inDegree[s.id] || 0) === 0).map(s => s.id);
  const visited = new Set<string>();

  while (queue.length > 0) {
    layers.push([...queue]);
    const next: string[] = [];
    for (const nodeId of queue) {
      visited.add(nodeId);
      for (const child of (children[nodeId] || [])) {
        inDegree[child]--;
        if (inDegree[child] === 0 && !visited.has(child)) {
          next.push(child);
        }
      }
    }
    queue = next;
  }

  // Add any unvisited nodes
  for (const s of steps) {
    if (!visited.has(s.id)) {
      layers.push([s.id]);
      visited.add(s.id);
    }
  }

  const positions: Record<string, { x: number; y: number }> = {};
  const NODE_W = 280;
  const NODE_H = 160;
  const PAD_X = 60;
  const PAD_Y = 40;

  for (let li = 0; li < layers.length; li++) {
    const layer = layers[li];
    const layerH = layer.length * NODE_H + (layer.length - 1) * PAD_Y;
    const startY = -layerH / 2;
    for (let ni = 0; ni < layer.length; ni++) {
      positions[layer[ni]] = {
        x: li * (NODE_W + PAD_X),
        y: startY + ni * (NODE_H + PAD_Y),
      };
    }
  }

  return positions;
}

interface WorkflowCanvasProps {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  positions: Record<string, { x: number; y: number }>;
  agents: AgentInfo[];
  workflows: Workflow[];  // for sub-workflow selection
  activeRun?: any;
  selectedStepId: string | null;
  onStepsChange: (steps: WorkflowStep[]) => void;
  onEdgesChange: (edges: WorkflowEdge[]) => void;
  onPositionsChange: (positions: Record<string, { x: number; y: number }>) => void;
  onSelectStep: (stepId: string | null) => void;
  onAddStep: (agent: string, position?: { x: number; y: number }) => void;
}

export default function WorkflowCanvas({
  steps,
  edges: wfEdges,
  positions,
  agents,
  workflows: _workflows,
  activeRun,
  selectedStepId,
  onStepsChange,
  onEdgesChange,
  onPositionsChange,
  onSelectStep,
  onAddStep,
}: WorkflowCanvasProps) {
  const reactFlowRef = useRef<any>(null);
  const [cycleWarning, setCycleWarning] = useState<string | null>(null);

  // Client-side cycle detection
  const cycleInfo = useMemo(() => {
    const stepIds = new Set(steps.map(s => s.id));
    return detectCycle(stepIds, wfEdges);
  }, [steps, wfEdges]);


  // Build port type lookup for edge labels
  const portTypeMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of steps) {
      for (const p of s.inputs) m[`${s.id}:${p.id}`] = p.type;
      for (const p of s.outputs) m[`${s.id}:${p.id}`] = p.type;
    }
    return m;
  }, [steps]);

  // Derive executing step IDs from run data (parallel DAG support)
  const executingStepIds = useMemo(() => {
    if (!activeRun || activeRun.status !== 'running') return new Set<string>();
    // Prefer executing_steps array (parallel DAG mode)
    if (activeRun.executing_steps && activeRun.executing_steps.length > 0) {
      return new Set<string>(activeRun.executing_steps);
    }
    // Fallback: legacy current_step index
    if (activeRun.current_step !== undefined && activeRun.current_step < steps.length) {
      const fallbackId = steps[activeRun.current_step]?.id;
      return fallbackId ? new Set([fallbackId]) : new Set<string>();
    }
    return new Set<string>();
  }, [activeRun, steps]);

  // Convert workflow data → ReactFlow nodes
  const rfNodes: Node[] = useMemo(() => {
    const pos = autoLayout(steps, wfEdges, positions);
    return steps.map((step, index) => ({
      id: step.id,
      type: 'stepNode',
      position: pos[step.id] || { x: index * 300, y: 0 },
      data: {
        step,
        index,
        isExecuting: executingStepIds.has(step.id),
        stepResult: activeRun?.results?.find((r: StepResult) => r.step_id === step.id || r.step_index === index),
        onSelect: onSelectStep,
        selected: selectedStepId === step.id,
      },
      selected: selectedStepId === step.id,
      className: cycleInfo.cycleNodes.has(step.id) ? 'cycle-node' : '',
    }));
  }, [steps, wfEdges, positions, activeRun, selectedStepId, onSelectStep, cycleInfo, executingStepIds]);

  // Convert workflow edges → ReactFlow edges with data type labels
  const rfEdges: Edge[] = useMemo(() => {
    return wfEdges.map(e => {
      const isConditional = e.condition && e.condition.type !== 'always';
      const srcPortType = portTypeMap[`${e.source}:${e.sourceHandle || 'output'}`];

      // Build label: show condition or data type
      let label: string | undefined;
      if (isConditional) {
        label = `if ${e.condition!.type.replace('if_', '').replace(/_/g, ' ')}`;
      } else if (srcPortType && srcPortType !== 'context') {
        label = srcPortType;
      }

      const isCycleEdge = cycleInfo.cycleNodes.has(e.source) && cycleInfo.cycleNodes.has(e.target);

      return {
        id: e.id,
        source: e.source,
        sourceHandle: e.sourceHandle || 'output',
        target: e.target,
        targetHandle: e.targetHandle || 'input',
        type: 'dataFlow',
        label,
        labelStyle: {
          fill: isConditional ? '#fbbf24' : isCycleEdge ? '#f87171' : '#94a3b8',
          fontSize: 10,
          fontWeight: 500,
        },
        labelBgStyle: { fill: 'rgba(22, 22, 31, 0.9)' },
        labelBgPadding: [6, 3] as [number, number],
        labelBgBorderRadius: 4,
        animated: activeRun?.status === 'running',
        style: {
          stroke: isCycleEdge  ? '#f87171' :
                  isConditional ? '#fbbf24' : '#3b3b50',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isCycleEdge ? '#f87171' :
                 isConditional ? '#fbbf24' : '#3b3b50',
        },
        data: {
          isConditional,
          isRunning: activeRun?.status === 'running',
          isCycleEdge,
        },
      };
    });
  }, [wfEdges, activeRun, portTypeMap, cycleInfo]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edgesState, setEdges, onEdgesChangeState] = useEdgesState(rfEdges);

  // Sync upstream rfNodes/rfEdges → local state
  useEffect(() => { setNodes(rfNodes); }, [rfNodes]);
  useEffect(() => { setEdges(rfEdges); }, [rfEdges]);

  // Handle node position changes (drag)
  const handleNodesChange: OnNodesChange = useCallback((changes) => {
    onNodesChange(changes);

    // Debounced position sync
    const posChanges = changes.filter(c => c.type === 'position' && 'position' in c && c.position);
    if (posChanges.length > 0) {
      const newPos = { ...positions };
      for (const c of posChanges) {
        if ('position' in c && c.position) {
          newPos[c.id] = c.position;
        }
      }
      onPositionsChange(newPos);
    }
  }, [onNodesChange, positions, onPositionsChange]);

  // Handle new edge connection with cycle validation
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return;

    // Prevent self-loops
    if (params.source === params.target) {
      setCycleWarning('Cannot connect a node to itself');
      setTimeout(() => setCycleWarning(null), 3000);
      return;
    }

    // Check for cycle with this new edge
    const stepIds = new Set(steps.map(s => s.id));
    const testEdges = [...wfEdges, { source: params.source, target: params.target }];
    const { hasCycle } = detectCycle(stepIds, testEdges);

    if (hasCycle) {
      setCycleWarning('This connection would create a cycle! DAG workflows cannot have circular dependencies.');
      setTimeout(() => setCycleWarning(null), 4000);
      return;
    }

    const newEdge: WorkflowEdge = {
      id: `e-${params.source}-${params.target}-${Date.now()}`,
      source: params.source,
      sourceHandle: params.sourceHandle || 'output',
      target: params.target,
      targetHandle: params.targetHandle || 'input',
    };
    onEdgesChange([...wfEdges, newEdge]);
  }, [wfEdges, onEdgesChange, steps]);

  // Handle edge removal
  const handleEdgesChange: OnEdgesChange = useCallback((changes) => {
    onEdgesChangeState(changes);
    const removedIds = changes
      .filter(c => c.type === 'remove')
      .map(c => c.id);
    if (removedIds.length > 0) {
      onEdgesChange(wfEdges.filter(e => !removedIds.includes(e.id)));
    }
  }, [onEdgesChangeState, wfEdges, onEdgesChange]);

  // Handle node deletion
  const onNodesDelete = useCallback((deleted: Node[]) => {
    const deletedIds = new Set(deleted.map(n => n.id));
    onStepsChange(steps.filter(s => !deletedIds.has(s.id)));
    onEdgesChange(wfEdges.filter(e => !deletedIds.has(e.source) && !deletedIds.has(e.target)));
    const newPos = { ...positions };
    for (const id of deletedIds) delete newPos[id];
    onPositionsChange(newPos);
    if (selectedStepId && deletedIds.has(selectedStepId)) {
      onSelectStep(null);
    }
  }, [steps, wfEdges, positions, selectedStepId, onStepsChange, onEdgesChange, onPositionsChange, onSelectStep]);

  // Background click → deselect
  const onPaneClick = useCallback(() => {
    onSelectStep(null);
  }, [onSelectStep]);

  // Auto-layout handler
  const handleAutoLayout = useCallback(() => {
    const newPos = autoLayout(steps, wfEdges);
    onPositionsChange(newPos);
  }, [steps, wfEdges, onPositionsChange]);

  // Drop handler for new nodes from toolbar
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const agent = e.dataTransfer.getData('application/workflow-agent');
    if (!agent || !reactFlowRef.current) return;

    const rfBounds = reactFlowRef.current.getBoundingClientRect();
    const position = {
      x: e.clientX - rfBounds.left - 100,
      y: e.clientY - rfBounds.top - 50,
    };

    onAddStep(agent, position);
  }, [onAddStep]);

  const activeAgents = agents.filter(a => a.status === 'active');

  // Count topological levels for display
  const levelCount = useMemo(() => {
    if (wfEdges.length === 0) return 0;
    const stepIdSet = new Set(steps.map(s => s.id));
    const inDeg: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    for (const s of steps) { inDeg[s.id] = 0; adj[s.id] = []; }
    for (const e of wfEdges) {
      if (stepIdSet.has(e.source) && stepIdSet.has(e.target)) {
        adj[e.source].push(e.target);
        inDeg[e.target] = (inDeg[e.target] || 0) + 1;
      }
    }
    let queue = steps.filter(s => (inDeg[s.id] || 0) === 0).map(s => s.id);
    let count = 0;
    while (queue.length > 0) {
      count++;
      const nextQ: string[] = [];
      for (const n of queue) {
        for (const c of (adj[n] || [])) {
          inDeg[c]--;
          if (inDeg[c] === 0) nextQ.push(c);
        }
      }
      queue = nextQ;
    }
    return count;
  }, [steps, wfEdges]);

  // Execution stats
  const execStats = useMemo(() => {
    if (!activeRun?.results) return null;
    const results = activeRun.results as StepResult[];
    const completed = results.filter(r => r.status === 'success').length;
    const failed = results.filter(r => r.status === 'error').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const total = steps.length;
    const parallel = executingStepIds.size;
    return { completed, failed, skipped, total, done: results.length, parallel };
  }, [activeRun, steps, executingStepIds]);

  return (
    <div className="relative w-full h-full" ref={reactFlowRef}>
      <ReactFlow
        nodes={nodes}
        edges={edgesState}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onPaneClick={onPaneClick}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
        minZoom={0.2}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'dataFlow',
          animated: false,
          style: { stroke: '#3b3b50', strokeWidth: 2 },
          markerEnd: { type: MarkerType.ArrowClosed, color: '#3b3b50' },
        }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e1e2e" />
        <Controls
          position="bottom-right"
          showZoom
          showFitView
          showInteractive={false}
          style={{ background: 'rgba(22,22,31,0.9)', borderColor: 'rgba(255,255,255,0.06)', borderRadius: '12px' }}
        />
        <MiniMap
          position="bottom-left"
          nodeColor={(node) => AGENT_COLORS[(node.data as any)?.step?.agent] || '#6b7280'}
          maskColor="rgba(10, 10, 15, 0.8)"
          style={{ background: 'rgba(22,22,31,0.9)', borderColor: 'rgba(255,255,255,0.06)', borderRadius: '12px' }}
        />

        {/* Toolbar Panel */}
        <Panel position="top-left">
          <div className="flex flex-col gap-1.5 bg-white border border-gray-200 rounded-xl p-2 shadow-sm">
            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider px-1 mb-1">
              Add Node
            </div>
            {activeAgents.map(a => {
              const AIcon = AGENT_ICONS[a.id] || Zap;
              return (
                <button
                  key={a.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/workflow-agent', a.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onClick={() => onAddStep(a.id)}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all border border-transparent hover:border-gray-200 cursor-grab active:cursor-grabbing"
                  title={`Add ${a.name} step (or drag onto canvas)`}
                >
                  <AIcon className="w-3.5 h-3.5" style={{ color: a.color || AGENT_COLORS[a.id] }} />
                  {a.name.split(' ')[0]}
                </button>
              );
            })}
            <div className="border-t border-border/20 my-1" />
            <button
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/workflow-agent', 'sub_workflow');
                e.dataTransfer.effectAllowed = 'move';
              }}
              onClick={() => onAddStep('sub_workflow')}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-200 cursor-grab active:cursor-grabbing"
              title="Add Sub-Workflow node"
            >
              <GitMerge className="w-3.5 h-3.5" />
              Sub-Flow
            </button>
            <div className="border-t border-border/20 my-1" />
            <button
              onClick={handleAutoLayout}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-all"
              title="Auto-arrange nodes"
            >
              <Layout className="w-3.5 h-3.5" />
              Auto Layout
            </button>
          </div>
        </Panel>

        {/* DAG Info Panel */}
        <Panel position="top-right">
          <div className="flex flex-col gap-1.5 bg-white border border-gray-200 rounded-xl p-2.5 min-w-[130px] shadow-sm">
            <div className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-0.5">
              DAG Info
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">Nodes</span>
              <span className="text-gray-900 font-semibold tabular-nums">{steps.length}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">Edges</span>
              <span className="text-gray-900 font-semibold tabular-nums">{wfEdges.length}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-gray-500">Mode</span>
              <span className={`font-semibold ${wfEdges.length > 0 ? 'text-blue-600' : 'text-gray-500'}`}>
                {wfEdges.length > 0 ? 'DAG ⚡' : 'Linear'}
              </span>
            </div>
            {wfEdges.length > 0 && levelCount > 0 && (
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-gray-500">Levels</span>
                <span className="text-indigo-600 font-semibold tabular-nums">{levelCount}</span>
              </div>
            )}
            {/* Validation status */}
            <div className="border-t border-gray-100 my-0.5" />
            <div className={`flex items-center gap-1 text-[10px] font-semibold ${
              cycleInfo.hasCycle ? 'text-red-500' : 'text-emerald-600'
            }`}>
              {cycleInfo.hasCycle
                ? <><AlertTriangle className="w-3 h-3" /> Cycle detected</>
                : <><Check className="w-3 h-3" /> Valid DAG</>
              }
            </div>
            {/* Execution progress */}
            {execStats && (
              <>
                <div className="border-t border-gray-100 my-0.5" />
                <div className="text-[10px] text-gray-500 flex items-center gap-1">
                  <span className="text-emerald-600 font-semibold">{execStats.completed}</span>
                  <span>/</span>
                  {execStats.failed > 0 && <span className="text-red-500 font-semibold">{execStats.failed}!</span>}
                  {execStats.skipped > 0 && <span className="text-gray-400">{execStats.skipped}⏭</span>}
                  <span className="text-gray-900 font-semibold">{execStats.total}</span>
                </div>
                {/* Parallel indicator */}
                {execStats.parallel > 1 && (
                  <div className="flex items-center gap-1 text-[10px]">
                    <Zap className="w-3 h-3 text-amber-500" />
                    <span className="text-amber-600 font-semibold">{execStats.parallel} parallel</span>
                  </div>
                )}
                {/* Mini progress bar */}
                <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(execStats.done / execStats.total) * 100}%`,
                      background: execStats.failed > 0
                        ? 'linear-gradient(90deg, #34d399, #f87171)'
                        : 'linear-gradient(90deg, #6366f1, #34d399)',
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </Panel>
      </ReactFlow>

      {/* Cycle Warning Toast */}
      {cycleWarning && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 animate-[slideDown_0.3s_ease-out]">
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 shadow-lg">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-xs text-red-700 font-medium">{cycleWarning}</span>
          </div>
        </div>
      )}
    </div>
  );
}
