import { Hono } from 'hono'

type Bindings = {
  DB: D1Database
  BUCKET: R2Bucket
  VECTOR: VectorizeIndex
  AGENT_ROOM: DurableObjectNamespace
}

// Durable Object class to hold the WebSockets in a single execution context
export class AgentRoom {
  state: DurableObjectState;
  env: Bindings;
  clients: WebSocket[];

  constructor(state: DurableObjectState, env: Bindings) {
    this.state = state;
    this.env = env;
    this.clients = [];
  }

  async fetch(request: Request) {
    // Only accept websocket connections
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();
    this.clients.push(server);

    server.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data as string);
        
        // Execute D1 safely
        if (this.env.DB && msg.content) {
          this.env.DB.prepare(
              `INSERT INTO logs (session_id, message_type, content, timestamp) VALUES (?1, ?2, ?3, ?4)`
          )
          .bind('default-session', msg.source || 'user', msg.content, Date.now())
          .run()
          .catch(err => {
              console.error("D1 Insert error", err);
          });
        }

        // Broadcast safely inside DO context
        this.clients.forEach(wsClient => {
          if (wsClient !== server && wsClient.readyState === 1) {
            try {
              wsClient.send(event.data);
            } catch (e) {
              // Ignore dead connections
            }
          }
        });
      } catch (e) {
        console.error('WS message processing error:', e, 'Raw data:', event.data);
      }
    });

    server.addEventListener('close', () => {
      this.clients = this.clients.filter(c => c !== server);
    });

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }
}

const app = new Hono<{ Bindings: Bindings }>()

app.get('/health', (c) => c.text('OK'))

app.get('/ws/agent', async (c) => {
  // Pass the websocket request to the Durable Object
  const id = c.env.AGENT_ROOM.idFromName('global-room');
  const room = c.env.AGENT_ROOM.get(id);
  
  return room.fetch(c.req.raw);
})

export default app
