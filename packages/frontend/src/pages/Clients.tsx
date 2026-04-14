import { useState, useEffect } from 'react';
import { Shield, Plus, Trash2, Key, Copy, CheckCircle2, FolderKey, Loader2 } from 'lucide-react';
import { clientsApi, type Client } from '../api/sessions';

export function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadClients = async () => {
    try {
      const data = await clientsApi.list();
      setClients(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClients();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await clientsApi.create({ name: newName.trim() });
      setNewName('');
      loadClients();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      return;
    }
    try {
      await clientsApi.delete(id);
      setConfirmDelete(null);
      loadClients();
    } catch (e) {
      console.error(e);
    }
  };

  const copyKey = (id: string, key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="p-8 h-full overflow-y-auto w-full max-w-6xl mx-auto flex flex-col gap-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-pink-500/10 text-pink-400 border border-pink-500/20 rounded-xl shadow-[0_0_20px_rgba(236,72,153,0.15)]">
              <FolderKey className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-pink-400 to-indigo-400 bg-clip-text text-transparent">
                Client Registry
              </h1>
              <p className="text-muted-foreground mt-1 text-sm font-medium">Manage API Client Integrations & Authentication Tokens</p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Card */}
      <div className="bg-card/40 border border-border/50 rounded-xl p-5 backdrop-blur-sm shadow-xl flex gap-4 text-sm text-foreground/80">
        <Shield className="w-6 h-6 text-indigo-400 shrink-0 mt-0.5" />
        <div className="flex flex-col gap-1.5">
          <p>
            When acting as an API host, Agent Route requires authenticated REST/WS requests. Any registered client acts as an isolated multi-tenant execution namespace.
          </p>
          <ul className="list-disc pl-5 opacity-80 mt-1 space-y-0.5">
            <li>Generate a unique Client API Key (<strong>sk_xxx</strong>) below.</li>
            <li>Pass it as <code className="bg-muted px-1.5 py-0.5 rounded text-indigo-300 font-mono text-xs">X-API-Key</code> Http Header.</li>
            <li>External traffic will be transparently restricted strictly to matching Sessions and Workflows.</li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
        
        {/* Client List */}
        <div className="bg-card border border-border/50 rounded-xl shadow-xl flex flex-col min-h-[400px]">
          <div className="p-4 border-b border-border/50 flex items-center justify-between bg-muted/20">
            <h2 className="font-semibold tracking-tight text-sm flex items-center gap-2">
              <Key className="w-4 h-4 text-emerald-400" /> API Keys
            </h2>
          </div>
          
          <div className="flex-1 p-3">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center opacity-50">
                <Loader2 className="w-8 h-8 animate-spin mb-2" />
                <p className="text-xs">Loading clients...</p>
              </div>
            ) : clients.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-50 py-12">
                <FolderKey className="w-10 h-10 mb-3" />
                <p className="text-sm">No client clients registered.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {clients.map(client => (
                  <div key={client.id} className="group border border-border/50 bg-background/50 hover:bg-muted/30 rounded-xl p-4 flex items-center gap-4 transition-colors">
                    <div className="flex-1 min-w-0 flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/10 rounded-lg shrink-0">
                        <FolderKey className="w-5 h-5 text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate">{client.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">{new Date(client.created_at).toLocaleDateString()}</p>
                      </div>
                    </div>
                    
                    {/* API Key Box */}
                    <div className="bg-muted/50 border border-border rounded-lg px-3 py-1.5 flex items-center gap-3">
                      <code className="text-xs font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded tracking-wide">
                        {client.api_key.substring(0, 15)}...
                      </code>
                      <button
                        onClick={() => copyKey(client.id, client.api_key)}
                        className={`p-1.5 rounded-md transition-colors ${copiedId === client.id ? 'bg-emerald-500/20 text-emerald-400' : 'hover:bg-background text-muted-foreground hover:text-foreground'}`}
                        title="Copy API Key"
                      >
                        {copiedId === client.id ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <button 
                      onClick={() => handleDelete(client.id)}
                      onMouseLeave={() => setConfirmDelete(null)}
                      className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${
                        confirmDelete === client.id 
                          ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 opacity-100' 
                          : 'opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400'
                      }`}
                      title={confirmDelete === client.id ? "Click again to confirm" : "Delete Client"}
                    >
                      <Trash2 className="w-4 h-4" />
                      {confirmDelete === client.id && <span className="text-[10px] font-bold uppercase tracking-wider">Confirm</span>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Create Sidebar */}
        <div className="flex flex-col gap-4">
          <div className="bg-card border border-border/50 rounded-xl p-4 shadow-xl">
            <h3 className="font-semibold text-sm mb-4">Register Client</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5 block">Client Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  placeholder="e.g. ai-research-app"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-pink-500/50"
                  spellCheck={false}
                />
              </div>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                className="w-full flex items-center justify-center gap-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 disabled:hover:bg-pink-600 text-white text-sm py-2 rounded-lg font-medium transition-colors"
              >
                <Plus className="w-4 h-4" /> Generate Token
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
