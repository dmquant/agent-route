import { useState, useRef, useEffect } from 'react';
import {
  Plus, MessageSquare, Trash2, ChevronDown, ChevronRight,
  Hash, X, FolderPlus, Sparkles, Loader2
} from 'lucide-react';
import type { SessionState } from '../hooks/useSessionState';

interface SessionPanelProps {
  state: SessionState;
  isOpen: boolean;
  onToggle: () => void;
  runningSessions?: Set<string>;
}

const PROJECT_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#06b6d4',
  '#3b82f6', '#a855f7', '#14b8a6', '#64748b',
];

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export function SessionPanel({ state, isOpen, onToggle, runningSessions = new Set() }: SessionPanelProps) {
  const [showNewProject, setShowNewProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectColor, setNewProjectColor] = useState('#6366f1');
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ type: 'session' | 'project'; id: string; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showNewProject && inputRef.current) {
      inputRef.current.focus();
    }
  }, [showNewProject]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  const toggleProject = (id: string) => {
    setExpandedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    await state.createProject(newProjectName.trim(), newProjectColor);
    setNewProjectName('');
    setShowNewProject(false);
  };

  const handleNewSession = async (projectId?: string | null) => {
    await state.createSession({ projectId });
  };

  // Group sessions by project
  const ungroupedSessions = state.sessions.filter(s => !s.project_id);
  const sessionsByProject = new Map<string, typeof state.sessions>();
  state.sessions.forEach(s => {
    if (s.project_id) {
      const existing = sessionsByProject.get(s.project_id) || [];
      existing.push(s);
      sessionsByProject.set(s.project_id, existing);
    }
  });

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute left-0 top-1/2 -translate-y-1/2 z-20 bg-card/90 border border-border/50 rounded-r-xl px-1.5 py-6 hover:bg-muted transition-colors shadow-lg backdrop-blur-sm"
        title="Open Sessions"
      >
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="w-72 border-r border-border/50 bg-card/30 backdrop-blur-md flex flex-col h-full shrink-0 relative">
      {/* Header */}
      <div className="p-3 border-b border-border/50 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold tracking-tight">Sessions</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowNewProject(true)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="New Project"
          >
            <FolderPlus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleNewSession(state.activeProjectId)}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="New Session"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Close Panel"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* New Project Form */}
      {showNewProject && (
        <div className="p-3 border-b border-border/50 bg-muted/30 space-y-2 animate-in slide-in-from-top-2 duration-200">
          <input
            ref={inputRef}
            value={newProjectName}
            onChange={e => setNewProjectName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') setShowNewProject(false); }}
            placeholder="Project name..."
            className="w-full bg-background border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
          />
          <div className="flex items-center gap-1.5 flex-wrap">
            {PROJECT_COLORS.map(c => (
              <button
                key={c}
                onClick={() => setNewProjectColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  newProjectColor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreateProject}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-xs py-1.5 rounded-lg font-medium transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setShowNewProject(false)}
              className="px-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project filter tabs */}
      <div className="p-2 border-b border-border/30 flex gap-1 overflow-x-auto shrink-0 custom-scrollbar">
        <button
          onClick={() => state.selectProject(null)}
          className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors ${
            state.activeProjectId === null
              ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
              : 'text-muted-foreground hover:bg-muted border border-transparent'
          }`}
        >
          All
        </button>
        {state.projects.map(p => (
          <button
            key={p.id}
            onClick={() => state.selectProject(p.id)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              state.activeProjectId === p.id
                ? 'bg-opacity-15 border'
                : 'text-muted-foreground hover:bg-muted border border-transparent'
            }`}
            style={state.activeProjectId === p.id ? {
              backgroundColor: `${p.color}20`,
              borderColor: `${p.color}40`,
              color: p.color,
            } : undefined}
          >
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
            {p.name}
          </button>
        ))}
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
        {/* Projects with nested sessions */}
        {state.activeProjectId === null && state.projects.map(project => {
          const projectSessions = sessionsByProject.get(project.id) || [];
          const isExpanded = expandedProjects.has(project.id);

          return (
            <div key={project.id} className="mb-1">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleProject(project.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ type: 'project', id: project.id, x: e.clientX, y: e.clientY });
                }}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleProject(project.id); } }}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors group cursor-pointer"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 shrink-0" />
                )}
                <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: project.color }} />
                <span className="truncate flex-1 text-left">{project.name}</span>
                <span className="text-[10px] text-muted-foreground/60">{projectSessions.length}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); handleNewSession(project.id); }}
                  className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-all"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>

              {isExpanded && projectSessions.map(session => (
                <SessionRow
                  key={session.id}
                  session={session}
                  isActive={state.activeSessionId === session.id}
                  isRunning={runningSessions.has(session.id)}
                  onSelect={() => state.selectSession(session.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ type: 'session', id: session.id, x: e.clientX, y: e.clientY });
                  }}
                  indent
                />
              ))}
            </div>
          );
        })}

        {/* Filtered sessions when a project is selected */}
        {state.activeProjectId !== null && state.sessions.map(session => (
          <SessionRow
            key={session.id}
            session={session}
            isActive={state.activeSessionId === session.id}
            isRunning={runningSessions.has(session.id)}
            onSelect={() => state.selectSession(session.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ type: 'session', id: session.id, x: e.clientX, y: e.clientY });
            }}
          />
        ))}

        {/* Ungrouped sessions (no project) */}
        {state.activeProjectId === null && ungroupedSessions.length > 0 && (
          <>
            <div className="px-2 pt-3 pb-1">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/50 font-semibold">
                Ungrouped
              </span>
            </div>
            {ungroupedSessions.map(session => (
              <SessionRow
                key={session.id}
                session={session}
                isActive={state.activeSessionId === session.id}
                isRunning={runningSessions.has(session.id)}
                onSelect={() => state.selectSession(session.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ type: 'session', id: session.id, x: e.clientX, y: e.clientY });
                }}
              />
            ))}
          </>
        )}

        {state.sessions.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground/50">
            <MessageSquare className="w-8 h-8 mb-3 opacity-40" />
            <p className="text-xs">No sessions yet</p>
            <button
              onClick={() => handleNewSession(state.activeProjectId)}
              className="mt-3 text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
            >
              Start a new session →
            </button>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-card border border-border rounded-xl shadow-2xl py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-150"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'session' && (
            <button
              onClick={() => { state.deleteSession(contextMenu.id); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Session
            </button>
          )}
          {contextMenu.type === 'project' && (
            <button
              onClick={() => { state.deleteProject(contextMenu.id); setContextMenu(null); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Project
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Session Row ────────────────────────────────────────────

function SessionRow({
  session,
  isActive,
  isRunning = false,
  onSelect,
  onContextMenu,
  indent = false,
}: {
  session: SessionState['sessions'][number];
  isActive: boolean;
  isRunning?: boolean;
  onSelect: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onSelect}
      onContextMenu={onContextMenu}
      className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150 group ${
        indent ? 'ml-4' : ''
      } ${
        isActive
          ? 'bg-indigo-500/10 border border-indigo-500/20 shadow-[0_0_12px_rgba(99,102,241,0.08)]'
          : 'hover:bg-muted/40 border border-transparent'
      }`}
    >
      {isRunning ? (
        <Loader2 className="w-3.5 h-3.5 mt-0.5 shrink-0 text-emerald-400 animate-spin" />
      ) : (
        <Hash className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isActive ? 'text-indigo-400' : 'text-muted-foreground/40'}`} />
      )}
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium truncate ${isActive ? 'text-indigo-300' : 'text-foreground/80'}`}>
          {session.title}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-muted-foreground/50">{session.agent_type}</span>
          <span className="text-[10px] text-muted-foreground/30">·</span>
          <span className="text-[10px] text-muted-foreground/50">{timeAgo(session.updated_at)}</span>
          {session.message_count > 0 && (
            <>
              <span className="text-[10px] text-muted-foreground/30">·</span>
              <span className="text-[10px] text-muted-foreground/50">{session.message_count} msgs</span>
            </>
          )}
          {isRunning && (
            <>
              <span className="text-[10px] text-muted-foreground/30">·</span>
              <span className="text-[10px] text-emerald-400 font-medium">running</span>
            </>
          )}
        </div>
      </div>
    </button>
  );
}


