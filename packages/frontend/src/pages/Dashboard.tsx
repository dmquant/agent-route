import { useState, useEffect } from 'react';
import { BarChart3, Activity, Clock, FileText, GitMerge, X, Terminal } from 'lucide-react';
import { OutputParser } from '../components/OutputParser';

interface LogDetail {
  id: number;
  title: string;
  agent: string;
  timeAgo: string;
  fullContent: string;
  status: 'success' | 'error' | 'running';
}

const MOCK_LOGS: LogDetail[] = [
  { 
    id: 1, 
    title: 'Analyzed workspace structure', 
    agent: 'Claude Code', 
    timeAgo: '2 mins ago', 
    status: 'success',
    fullContent: '[System] Executing task natively securely.\nTarget: claude\nDirectory: /packages/frontend\n\n$ npx @anthropic-ai/claude-code\nAnalyzing workspace directories...\nFound: /src/pages/Dashboard.tsx\nDone.'
  },
  { 
    id: 2, 
    title: 'Generative image routing', 
    agent: 'MFLUX Visual', 
    timeAgo: '15 mins ago', 
    status: 'running',
    fullContent: '[System] Connecting to remote MFLUX Visual Inference Engine at http://192.168.0.212:8000...\n[System] Depending on the cache state, this could take up to 45 seconds for 30 steps. Please wait.'
  },
  { 
    id: 3, 
    title: 'Code translation script', 
    agent: 'Codex Server', 
    timeAgo: '42 mins ago', 
    status: 'error',
    fullContent: 'ERROR: Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.'
  },
  { 
    id: 4, 
    title: 'Morning source sync', 
    agent: 'Local Ollama', 
    timeAgo: '2 hours ago', 
    status: 'success',
    fullContent: 'Data loaded successfully from upstream git repository.\n12 files processed and synchronized locally.'
  },
  { 
    id: 5, 
    title: 'Routine analytics compilation', 
    agent: 'Gemini CLI', 
    timeAgo: '4 hours ago', 
    status: 'success',
    fullContent: 'Compiled aggregate metrics for dashboard.\nAll outputs saved to: /tmp/analytics-2026.json'
  },
];

export function Dashboard() {
  const [selectedLog, setSelectedLog] = useState<LogDetail | null>(null);
  const [historyLogs, setHistoryLogs] = useState<LogDetail[]>([]);

  useEffect(() => {
    fetch('http://localhost:8000/api/logs')
      .then(r => r.json())
      .then(data => {
        if (data.logs && data.logs.length > 0) {
          setHistoryLogs(data.logs);
        } else {
           // Fallback to mock logs if DB is empty
          setHistoryLogs(MOCK_LOGS);
        }
      })
      .catch(() => setHistoryLogs(MOCK_LOGS));
  }, []);

  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative custom-scrollbar">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workspace Dashboard</h1>
          <p className="text-muted-foreground mt-2">Overview of all logs, histories, and daily usage reports.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Total Executions', value: '1,284', icon: Activity, color: 'text-blue-500' },
            { label: 'Active Workflows', value: '12', icon: GitMerge, color: 'text-indigo-500' },
            { label: 'Scheduled Tasks', value: '4', icon: Clock, color: 'text-orange-500' },
            { label: 'Tokens Used', value: '2.4M', icon: BarChart3, color: 'text-green-500' },
          ].map((stat, i) => {
            const Icon = stat.icon;
            return (
              <div key={i} className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                  <div className={`p-2 rounded-md bg-background ${stat.color} bg-opacity-10`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </div>
                <div className="text-3xl font-bold">{stat.value}</div>
              </div>
            );
          })}
        </div>

        {/* Recent Activity and Logs */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm min-h-[400px]">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <Activity className="w-5 h-5 text-indigo-400" />
              Daily Usage Report
            </h2>
            <div className="flex items-center justify-center h-64 text-muted-foreground border border-dashed border-border rounded-lg bg-card/30">
              <span className="text-sm">Chart visualization goes here</span>
            </div>
          </div>
          
          <div className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-6 shadow-sm min-h-[400px] flex flex-col">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2 shrink-0">
              <FileText className="w-5 h-5 text-indigo-400" />
              Recent Logs
            </h2>
            <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1">
              {historyLogs.map((log) => (
                <div 
                  key={log.id} 
                  onClick={() => setSelectedLog(log)}
                  className="flex gap-3 text-sm pb-4 border-b border-border/50 last:border-0 cursor-pointer hover:bg-muted/40 p-2 rounded-lg transition-colors group"
                >
                  <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                    log.status === 'success' ? 'bg-green-500' : 
                    log.status === 'error' ? 'bg-red-500' : 'bg-indigo-500 animate-pulse'
                  }`} />
                  <div className="flex-1 w-full overflow-hidden">
                    <p className="text-card-foreground font-medium truncate group-hover:text-indigo-400 transition-colors">{log.title}</p>
                    <p className="text-xs text-muted-foreground mt-1 flex justify-between">
                      <span>{log.agent}</span>
                      <span className="opacity-70">{log.timeAgo}</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Log Details Modal Overlay */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm px-4">
          <div className="bg-card border border-border shadow-2xl rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-in fade-in zoom-in duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-border shrink-0">
              <div className="flex items-center gap-4">
                <div className={`p-2 rounded-lg bg-background border border-border ${
                    selectedLog.status === 'success' ? 'text-green-500' : 
                    selectedLog.status === 'error' ? 'text-red-500' : 'text-indigo-500'
                  }`}>
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg leading-tight">{selectedLog.title}</h3>
                  <div className="text-sm text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>{selectedLog.agent}</span>
                    <span>•</span>
                    <span>{selectedLog.timeAgo}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedLog(null)}
                className="p-2 text-muted-foreground hover:bg-muted rounded-full transition-colors hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Output Parser View */}
            <div className="flex-1 overflow-y-auto p-6 bg-card/30 custom-scrollbar">
              <div className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                Execution Trace
                <div className="h-px bg-border flex-1 ml-2" />
              </div>
              
              <div className="rounded-xl overflow-hidden border border-border/60 bg-background shadow-inner">
                <div className="p-4">
                  <OutputParser content={selectedLog.fullContent} />
                </div>
              </div>
            </div>
            
          </div>
        </div>
      )}
    </div>
  );
}
