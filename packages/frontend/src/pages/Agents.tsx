import { Settings, Plus, Terminal, Play, Code, Box, Cpu } from 'lucide-react';

export function Agents() {
  const agents = [
    { name: 'Gemini CLI', type: 'CLI Integration', status: 'Active', icon: Terminal, color: 'text-blue-400' },
    { name: 'Claude Code', type: 'CLI Integration', status: 'Active', icon: Cpu, color: 'text-orange-400' },
    { name: 'Local Ollama', type: 'Native SDK', status: 'Ready', icon: Play, color: 'text-green-400' },
    { name: 'Codex Server', type: 'REST API', status: 'Reauthenticating', icon: Code, color: 'text-red-400' },
  ];

  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Agents & Skills</h1>
            <p className="text-muted-foreground mt-2">Configure different agents and attach skills targeting different model clients.</p>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            New Agent
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent, i) => {
            const Icon = agent.icon;
            return (
              <div key={i} className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm hover:border-indigo-500/30 transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-background rounded-lg border border-border/50 group-hover:bg-indigo-500/10 transition-colors">
                    <Icon className={`w-6 h-6 ${agent.color}`} />
                  </div>
                  <button className="text-muted-foreground hover:text-foreground">
                    <Settings className="w-5 h-5" />
                  </button>
                </div>
                <h3 className="font-semibold text-lg">{agent.name}</h3>
                <p className="text-sm text-muted-foreground mb-4">{agent.type}</p>
                <div className="flex items-center justify-between">
                  <span className={`text-xs px-2 py-1 rounded-full border ${agent.status === 'Active' || agent.status === 'Ready' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-orange-500/10 border-orange-500/20 text-orange-400'}`}>
                    {agent.status}
                  </span>
                  <div className="flex -space-x-2">
                    {[1, 2].map((k) => (
                      <div key={k} className="w-6 h-6 rounded-full bg-muted border-2 border-card flex items-center justify-center">
                        <Box className="w-3 h-3 text-muted-foreground" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
