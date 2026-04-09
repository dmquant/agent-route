import { useState, useCallback, useEffect } from 'react';
import type { Project, Session, Message } from '../api/sessions';
import { projectsApi, sessionsApi } from '../api/sessions';

export interface SessionState {
  // Data
  projects: Project[];
  sessions: Session[];
  activeSessionId: string | null;
  activeProjectId: string | null;
  messages: Message[];
  isLoading: boolean;

  // Project actions
  loadProjects: () => Promise<void>;
  createProject: (name: string, color?: string) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  selectProject: (id: string | null) => void;

  // Session actions
  loadSessions: (projectId?: string | null) => Promise<void>;
  createSession: (opts?: { projectId?: string | null; agentType?: string }) => Promise<Session>;
  selectSession: (id: string) => Promise<void>;
  deleteSession: (id: string) => Promise<void>;
  refreshCurrentSession: () => Promise<void>;

  // Message actions
  loadMessages: (sessionId: string) => Promise<void>;
  appendLocalMessage: (msg: Message) => void;
  updateLastAgentMessage: (content: string) => void;
}

export function useSessionState(): SessionState {
  const [projects, setProjects] = useState<Project[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      const data = await projectsApi.list();
      setProjects(data);
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }, []);

  const createProject = useCallback(async (name: string, color?: string) => {
    const project = await projectsApi.create({ name, color: color || '#6366f1' });
    setProjects(prev => [project, ...prev]);
    return project;
  }, []);

  const deleteProject = useCallback(async (id: string) => {
    await projectsApi.delete(id);
    setProjects(prev => prev.filter(p => p.id !== id));
    if (activeProjectId === id) {
      setActiveProjectId(null);
    }
  }, [activeProjectId]);

  const selectProject = useCallback((id: string | null) => {
    setActiveProjectId(id);
  }, []);

  const loadSessions = useCallback(async (projectId?: string | null) => {
    try {
      const data = await sessionsApi.list(projectId);
      setSessions(data);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  }, []);

  const createSession = useCallback(async (opts?: { projectId?: string | null; agentType?: string }) => {
    const session = await sessionsApi.create({
      project_id: opts?.projectId,
      agent_type: opts?.agentType || 'gemini',
    });
    setSessions(prev => [session, ...prev]);
    setActiveSessionId(session.id);
    setMessages([]);
    return session;
  }, []);

  const selectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    setIsLoading(true);
    try {
      const msgs = await sessionsApi.messages(id, true);
      setMessages(msgs);
    } catch (e) {
      console.error('Failed to load messages:', e);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteSession = useCallback(async (id: string) => {
    await sessionsApi.delete(id);
    setSessions(prev => prev.filter(s => s.id !== id));
    if (activeSessionId === id) {
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [activeSessionId]);

  const refreshCurrentSession = useCallback(async () => {
    // Reload session list to get updated titles/counts
    await loadSessions(activeProjectId);
  }, [loadSessions, activeProjectId]);

  const loadMessages = useCallback(async (sessionId: string) => {
    const msgs = await sessionsApi.messages(sessionId, true);
    setMessages(msgs);
  }, []);

  const appendLocalMessage = useCallback((msg: Message) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const updateLastAgentMessage = useCallback((content: string) => {
    setMessages(prev => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (last.source === 'agent') {
        const updated = [...prev];
        updated[updated.length - 1] = { ...last, content: last.content + content };
        return updated;
      }
      return prev;
    });
  }, []);

  // Initial load
  useEffect(() => {
    loadProjects();
    loadSessions();
  }, [loadProjects, loadSessions]);

  // Reload sessions when project filter changes
  useEffect(() => {
    loadSessions(activeProjectId);
  }, [activeProjectId, loadSessions]);

  return {
    projects,
    sessions,
    activeSessionId,
    activeProjectId,
    messages,
    isLoading,
    loadProjects,
    createProject,
    deleteProject,
    selectProject,
    loadSessions,
    createSession,
    selectSession,
    deleteSession,
    refreshCurrentSession,
    loadMessages,
    appendLocalMessage,
    updateLastAgentMessage,
  };
}
