import { Plus, ArrowRight, GitMerge, FileCode2 } from 'lucide-react';

export function Workflows() {
  return (
    <div className="p-8 h-full overflow-y-auto z-10 relative">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Workflows</h1>
            <p className="text-muted-foreground mt-2">Generate and manage autonomous orchestrations passing context between agents.</p>
          </div>
          <button className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Create Workflow
          </button>
        </div>

        <div className="bg-card/30 border border-dashed border-border/60 rounded-xl p-12 text-center">
          <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
            <GitMerge className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-medium">No workflows defined</h3>
          <p className="text-muted-foreground max-w-md mx-auto mt-2 mb-6">Create your first multi-agent orchestration workflow to automate complex tasks across platforms.</p>
          <button className="bg-card border border-border hover:bg-muted text-card-foreground px-4 py-2 rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2">
            <FileCode2 className="w-4 h-4" />
            Import from YAML
          </button>
        </div>
      </div>
    </div>
  );
}
