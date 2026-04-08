import { Plus, Calendar, Clock, RefreshCw } from 'lucide-react';

export function Routines() {
  const routines = [
    { title: 'Morning Source Sync', schedule: 'Daily at 08:00', status: 'Enabled', lastRun: 'Today, 08:00', icon: RefreshCw },
    { title: 'Weekly Reports Gen', schedule: 'Fridays at 17:00', status: 'Enabled', lastRun: 'Last Friday', icon: Calendar },
  ];

  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Routines</h1>
            <p className="text-muted-foreground mt-2">Schedule and manage routine works using CRON expressions.</p>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Routine
          </button>
        </div>

        <div className="grid gap-4">
          {routines.map((r, i) => {
            const Icon = r.icon;
            return (
              <div key={i} className="bg-card/50 backdrop-blur-md border border-border/50 rounded-xl p-5 shadow-sm flex items-center justify-between hover:bg-card transition-colors">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-background rounded-lg border border-border/50 text-indigo-400">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-base">{r.title}</h3>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {r.schedule}</span>
                      <span>•</span>
                      <span>Last run: {r.lastRun}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs font-medium text-green-400 bg-green-500/10 px-3 py-1 rounded-full border border-green-500/20">
                    {r.status}
                  </span>
                  <button className="text-sm font-medium text-indigo-400 hover:text-indigo-300">Edit</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
