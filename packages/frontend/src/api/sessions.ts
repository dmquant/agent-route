// ─── Types ──────────────────────────────────────────────────

export interface Client {
  id: string;
  name: string;
  api_key: string;
  created_at: number;
  updated_at: number;
}

export interface Project {
  id: string;
  client_id: string | null;
  name: string;
  description: string;
  color: string;
  created_at: number;
  updated_at: number;
  session_count: number;
}

export interface Session {
  id: string;
  project_id: string | null;
  title: string;
  agent_type: string;
  created_at: number;
  updated_at: number;
  message_count: number;
  last_message: { content: string; source: string } | null;
}

export interface Message {
  id: number;
  session_id: string;
  source: 'user' | 'agent' | 'system';
  content: string;
  agent_type: string | null;
  image_b64?: string | null;
  created_at: number;
}

// ─── API Client ─────────────────────────────────────────────

const API_BASE = 'http://localhost:8000';
const ADMIN_API_KEY = 'sk_admin_route_2025';

async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const headers = new Headers(opts?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!headers.has('X-API-Key')) headers.set('X-API-Key', ADMIN_API_KEY);

  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers,
  });
  if (!res.ok) throw new Error(`API Error ${res.status}: ${await res.text()}`);
  return res.json();
}

// Clients
export const clientsApi = {
  list: () => apiFetch<{ clients: Client[] }>('/api/clients').then(r => r.clients),
  create: (data: { name: string }) =>
    apiFetch<{ client: Client }>('/api/clients', { method: 'POST', body: JSON.stringify(data) }).then(r => r.client),
  delete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/clients/${id}`, { method: 'DELETE' }),
};

// Projects
export const projectsApi = {
  list: () => apiFetch<{ projects: Project[] }>('/api/projects').then(r => r.projects),
  create: (data: { name: string; description?: string; color?: string }) =>
    apiFetch<{ project: Project }>('/api/projects', { method: 'POST', body: JSON.stringify(data) }).then(r => r.project),
  update: (id: string, data: { name?: string; description?: string; color?: string }) =>
    apiFetch<{ project: Project }>(`/api/projects/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.project),
  delete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/projects/${id}`, { method: 'DELETE' }),
};

// Sessions
export const sessionsApi = {
  list: (projectId?: string | null) => {
    const params = projectId ? `?project_id=${projectId}` : '';
    return apiFetch<{ sessions: Session[] }>(`/api/sessions${params}`).then(r => r.sessions);
  },
  create: (data: { project_id?: string | null; title?: string; agent_type?: string }) =>
    apiFetch<{ session: Session }>('/api/sessions', { method: 'POST', body: JSON.stringify(data) }).then(r => r.session),
  get: (id: string) =>
    apiFetch<{ session: Session }>(`/api/sessions/${id}`).then(r => r.session),
  update: (id: string, data: { title?: string; project_id?: string | null }) =>
    apiFetch<{ session: Session }>(`/api/sessions/${id}`, { method: 'PUT', body: JSON.stringify(data) }).then(r => r.session),
  delete: (id: string) =>
    apiFetch<{ ok: boolean }>(`/api/sessions/${id}`, { method: 'DELETE' }),
  messages: (id: string, includeImages = false) =>
    apiFetch<{ messages: Message[] }>(`/api/sessions/${id}/messages?include_images=${includeImages}`).then(r => r.messages),
};
