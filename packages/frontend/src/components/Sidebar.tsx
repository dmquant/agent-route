import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, GitMerge, Clock, MessageSquare, LayoutPanelLeft } from 'lucide-react';

export function Sidebar() {
  const navItems = [
    { path: '/', label: 'Dashboard', icon: LayoutDashboard, desc: 'Overview & Reports' },
    { path: '/agents', label: 'Agents & Skills', icon: Users, desc: 'Configuration' },
    { path: '/workflows', label: 'Workflows', icon: GitMerge, desc: 'Orchestrations' },
    { path: '/routines', label: 'Routines', icon: Clock, desc: 'Scheduled Tasks' },
    { path: '/chat', label: 'Workspace', icon: MessageSquare, desc: 'Interactive Terminal' },
  ];

  return (
    <div className="w-64 border-r border-border bg-card/50 backdrop-blur-sm flex flex-col p-4 z-10">
      <div className="flex items-center gap-2 mb-8 px-2">
        <LayoutPanelLeft className="w-6 h-6 text-indigo-500" />
        <h1 className="font-bold tracking-tight text-lg">Agent Workspace</h1>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">Navigation</h2>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-start gap-3 p-3 rounded-lg transition-all duration-200 text-left
                ${isActive 
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)]' 
                  : 'hover:bg-muted text-muted-foreground hover:text-foreground border border-transparent'}
              `}
            >
              {({ isActive }) => (
                <>
                  <div className={`p-2 rounded-md ${isActive ? 'bg-indigo-500/20' : 'bg-muted-foreground/10'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className={`font-medium text-sm ${isActive ? 'text-indigo-400' : ''}`}>{item.label}</div>
                    <div className="text-xs opacity-70 mt-0.5">{item.desc}</div>
                  </div>
                </>
              )}
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
