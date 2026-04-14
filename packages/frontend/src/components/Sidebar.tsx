import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, GitMerge, BarChart3, MessageSquare, LayoutPanelLeft, Brain, FolderKey, Languages } from 'lucide-react';
import { useLanguage } from '../i18n';

export function Sidebar() {
  const { t, language, setLanguage } = useLanguage();

  const navItems = [
    { path: '/', label: t('nav.dashboard'), icon: LayoutDashboard, desc: t('nav.dashboard.desc') },
    { path: '/agents', label: t('nav.agents'), icon: Users, desc: t('nav.agents.desc') },
    { path: '/brain', label: t('nav.brain'), icon: Brain, desc: t('nav.brain.desc') },
    { path: '/workflows', label: t('nav.workflows'), icon: GitMerge, desc: t('nav.workflows.desc') },
    { path: '/clients', label: t('nav.clients'), icon: FolderKey, desc: t('nav.clients.desc') },
    { path: '/routines', label: t('nav.routines'), icon: BarChart3, desc: t('nav.routines.desc') },
    { path: '/chat', label: t('nav.chat'), icon: MessageSquare, desc: t('nav.chat.desc') },
  ];

  return (
    <div className="w-64 border-r border-border bg-card/50 backdrop-blur-sm flex flex-col p-4 z-10 h-full">
      <div className="flex items-center gap-2 mb-8 px-2">
        <LayoutPanelLeft className="w-6 h-6 text-indigo-500" />
        <h1 className="font-bold tracking-tight text-lg">{t('sidebar.title')}</h1>
      </div>

      <div className="flex flex-col gap-2 flex-1">
        <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 px-2">{t('sidebar.navigation')}</h2>
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

      <div className="mt-auto px-2 pt-4 border-t border-border/50">
        <button
          onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
          className="flex flex-col items-start gap-1 p-3 w-full rounded-lg transition-all border border-transparent hover:border-border hover:bg-muted text-muted-foreground hover:text-foreground"
        >
           <div className="flex items-center gap-2 font-medium text-sm w-full">
             <Languages className="w-4 h-4 text-indigo-400" />
             {language === 'en' ? 'Language : English' : '语言 : 简体中文'}
             <span className="ml-auto text-[10px] bg-muted-foreground/20 px-1.5 py-0.5 rounded opacity-70">
               {language === 'en' ? '切换' : 'Switch'}
             </span>
           </div>
        </button>
      </div>
    </div>
  );
}
