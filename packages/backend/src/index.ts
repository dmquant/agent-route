import { Hono } from 'hono'
import { cors } from 'hono/cors'

type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
  VECTOR: VectorizeIndex
  AGENT_ROOM: DurableObjectNamespace
}

// ─── Durable Object: WebSocket relay room ──────────
export class AgentRoom {
  state: DurableObjectState
  env: Bindings
  clients: WebSocket[]

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state
    this.env = env
    this.clients = []
  }

  async fetch(request: Request) {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 })
    }

    const webSocketPair = new WebSocketPair()
    const [client, server] = Object.values(webSocketPair)

    server.accept()
    this.clients.push(server)

    server.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string)

        // Persist messages to D1
        if (this.env.DB && msg.content && msg.sessionId) {
          this.env.DB.prepare(
            `INSERT INTO messages (session_id, source, content, agent_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5)`
          )
          .bind(msg.sessionId, msg.source || 'user', msg.content, msg.agentType || null, Date.now())
          .run()
          .catch(err => console.error('D1 Insert error', err))
        }

        // Broadcast to other connected clients
        this.clients.forEach(wsClient => {
          if (wsClient !== server && wsClient.readyState === 1) {
            try { wsClient.send(event.data) } catch (_) {}
          }
        })
      } catch (e) {
        console.error('WS message processing error:', e)
      }
    })

    server.addEventListener('close', () => {
      this.clients = this.clients.filter(c => c !== server)
    })

    return new Response(null, { status: 101, webSocket: client })
  }
}

// ─── Hono App (Cloudflare Workers) ──────────
const app = new Hono<{ Bindings: Bindings }>()

app.use('/*', cors())

// Health check
app.get('/health', (c) => c.text('OK'))

// ─── Projects ──────────
app.get('/api/projects', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
  return c.json({ projects: results })
})

app.post('/api/projects', async (c) => {
  const body = await c.req.json()
  const id = crypto.randomUUID().replace(/-/g, '')
  const now = Date.now()
  await c.env.DB.prepare(
    'INSERT INTO projects (id, name, description, color, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
  ).bind(id, body.name || 'Untitled', body.description || '', body.color || '#6366f1', now, now).run()

  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id=?1').bind(id).first()
  return c.json({ project })
})

app.put('/api/projects/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const now = Date.now()
  const sets: string[] = []
  const vals: any[] = []
  if (body.name !== undefined) { sets.push('name=?'); vals.push(body.name) }
  if (body.description !== undefined) { sets.push('description=?'); vals.push(body.description) }
  if (body.color !== undefined) { sets.push('color=?'); vals.push(body.color) }
  sets.push('updated_at=?'); vals.push(now)
  vals.push(id)
  await c.env.DB.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id=?`).bind(...vals).run()
  const project = await c.env.DB.prepare('SELECT * FROM projects WHERE id=?1').bind(id).first()
  return c.json({ project })
})

app.delete('/api/projects/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM projects WHERE id=?1').bind(id).run()
  return c.json({ ok: true })
})

// ─── Sessions ──────────
app.get('/api/sessions', async (c) => {
  const projectId = c.req.query('project_id')
  let stmt
  if (projectId) {
    stmt = c.env.DB.prepare('SELECT * FROM sessions WHERE project_id=?1 ORDER BY updated_at DESC').bind(projectId)
  } else {
    stmt = c.env.DB.prepare('SELECT * FROM sessions ORDER BY updated_at DESC')
  }
  const { results } = await stmt.all()
  return c.json({ sessions: results })
})

app.post('/api/sessions', async (c) => {
  const body = await c.req.json()
  const id = crypto.randomUUID().replace(/-/g, '')
  const now = Date.now()
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, project_id, title, agent_type, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
  ).bind(id, body.project_id || null, body.title || 'New Session', body.agent_type || 'gemini', now, now).run()

  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id=?1').bind(id).first()
  return c.json({ session })
})

app.put('/api/sessions/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const now = Date.now()
  const sets: string[] = []
  const vals: any[] = []
  if (body.title !== undefined) { sets.push('title=?'); vals.push(body.title) }
  if (body.project_id !== undefined) { sets.push('project_id=?'); vals.push(body.project_id) }
  sets.push('updated_at=?'); vals.push(now)
  vals.push(id)
  await c.env.DB.prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE id=?`).bind(...vals).run()
  const session = await c.env.DB.prepare('SELECT * FROM sessions WHERE id=?1').bind(id).first()
  return c.json({ session })
})

app.delete('/api/sessions/:id', async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM messages WHERE session_id=?1').bind(id).run()
  await c.env.DB.prepare('DELETE FROM sessions WHERE id=?1').bind(id).run()
  return c.json({ ok: true })
})

// ─── Messages ──────────
app.get('/api/sessions/:id/messages', async (c) => {
  const id = c.req.param('id')
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM messages WHERE session_id=?1 ORDER BY created_at ASC'
  ).bind(id).all()
  return c.json({ messages: results })
})

app.post('/api/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id')
  const body = await c.req.json()
  const now = Date.now()
  await c.env.DB.prepare(
    'INSERT INTO messages (session_id, source, content, image_b64, agent_type, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)'
  ).bind(sessionId, body.source, body.content, body.image_b64 || null, body.agent_type || null, now).run()
  await c.env.DB.prepare('UPDATE sessions SET updated_at=?1 WHERE id=?2').bind(now, sessionId).run()
  return c.json({ ok: true })
})

// ─── Historical Logs (legacy) ──────────
app.get('/api/logs', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM historical_logs ORDER BY timestamp DESC LIMIT 50'
  ).all()
  return c.json({ logs: results })
})

// ─── WebSocket through Durable Object ──────────
app.get('/ws/agent', async (c) => {
  const id = c.env.AGENT_ROOM.idFromName('global-room')
  const room = c.env.AGENT_ROOM.get(id)
  return room.fetch(c.req.raw)
})

export default app
