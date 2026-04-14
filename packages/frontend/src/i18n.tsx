import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'en' | 'zh';

interface Translations {
  [key: string]: {
    en: string;
    zh: string;
  };
}

const translations: Translations = {
  // Sidebar
  "nav.dashboard": { en: "Dashboard", zh: "仪表盘" },
  "nav.dashboard.desc": { en: "Overview & Reports", zh: "概览与报告" },
  "nav.agents": { en: "Agents & Skills", zh: "智能体与技能" },
  "nav.agents.desc": { en: "Configuration", zh: "系统配置" },
  "nav.brain": { en: "Brain Inspector", zh: "大脑检查器" },
  "nav.brain.desc": { en: "Sessions & Context", zh: "会话与上下文" },
  "nav.workflows": { en: "Workflows", zh: "工作流" },
  "nav.workflows.desc": { en: "Orchestrations", zh: "编排与执行" },
  "nav.clients": { en: "API Keys", zh: "API 密钥" },
  "nav.clients.desc": { en: "Client Registration", zh: "客户端注册" },
  "nav.routines": { en: "Daily Reports", zh: "每日报告" },
  "nav.routines.desc": { en: "Usage Analytics", zh: "使用情况分析" },
  "nav.chat": { en: "Workspace", zh: "工作区" },
  "nav.chat.desc": { en: "Interactive Terminal", zh: "交互式终端" },
  "sidebar.title": { en: "Agent Workspace", zh: "智能体工作区" },
  "sidebar.navigation": { en: "Navigation", zh: "导航" },
  "language.switch": { en: "English", zh: "中文" },

  // General Status
  "status.active": { en: "Active", zh: "激活" },
  "status.inactive": { en: "Inactive", zh: "未激活" },
  "button.refresh": { en: "Refresh", zh: "刷新" },
  "button.save": { en: "Save", zh: "保存" },
  "button.cancel": { en: "Cancel", zh: "取消" },
  // Dashboard
  "dashboard.title": { en: "Task Report Dashboard", zh: "任务报告仪表盘" },
  "dashboard.subtitle": { en: "Aggregate performance analytics, agent benchmarking, and error monitoring", zh: "综合性能分析、智能体基准测试与错误监控" },
  "dashboard.today": { en: "Today", zh: "今天" },
  "dashboard.totalTasks": { en: "Total Tasks", zh: "总任务数" },
  "dashboard.successRate": { en: "Success Rate", zh: "成功率" },
  "dashboard.avgLatency": { en: "Avg Latency", zh: "平均延迟" },
  "dashboard.throughput": { en: "Throughput", zh: "吞吐量" },
  "dashboard.activeAgents": { en: "Active Agents", zh: "活跃智能体" },
  "dashboard.errorCount": { en: "Error Count", zh: "错误数量" },
  "dashboard.hourlyActivity": { en: "Hourly Activity", zh: "每小时活动图" },
  "dashboard.dailyTrend": { en: "Daily Trend", zh: "每日趋势" },
  "dashboard.agentPerf": { en: "Agent Performance", zh: "智能体性能" },
  "dashboard.agentBenchmark": { en: "Agent Benchmark", zh: "智能体基准测试" },
  "dashboard.recentErrors": { en: "Recent Errors", zh: "近期错误" },
  "dashboard.topSessions": { en: "Top Sessions", zh: "活跃会话" },
  "dashboard.noData": { en: "No Task Data Yet", zh: "暂无任务数据" },
  "dashboard.noDataDesc": { en: "Run some tasks through the Workspace chat to see performance analytics, agent benchmarks, and error monitoring here.", zh: "在工作区内运行任务，即可在此查看性能分析、基准测试和监控指标。" },

  // Brain Inspector
  "brain.title": { en: "Brain Inspector", zh: "大脑检查器" },
  "brain.subtitle": { en: "Unified middle desk — all API calls, sessions, workflows, and orchestrator status", zh: "统一分析台 — 掌控所有API调用、会话流、工作流和编排器状态" },
  "brain.tab.activity": { en: "Activity Desk", zh: "活动工作台" },
  "brain.tab.inspector": { en: "Session Inspector", zh: "会话检查器" },
  "brain.selectSession": { en: "Select Session", zh: "选择会话" },
  "brain.wake": { en: "Wake", zh: "唤醒" },
  "brain.pause": { en: "Pause", zh: "暂停" },
  "brain.totalEvents": { en: "Total Events", zh: "总事件数" },
  "brain.inputTokens": { en: "Input Tokens", zh: "输入 Tokens" },
  "brain.outputTokens": { en: "Output Tokens", zh: "输出 Tokens" },
  "brain.duration": { en: "Duration", zh: "持续时间" },
  "brain.contextLoad": { en: "Context Load", zh: "上下文负载" },
  "brain.eventLog": { en: "Event Log", zh: "事件日志" },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');

  useEffect(() => {
    const saved = localStorage.getItem('i18n_lang') as Language;
    if (saved && (saved === 'en' || saved === 'zh')) {
      setLanguageState(saved);
    } // otherwise check browser pref
    else if (navigator.language.startsWith('zh')) {
      setLanguageState('zh');
    }
  }, []);

  const setLanguage = (lang: Language) => {
    localStorage.setItem('i18n_lang', lang);
    setLanguageState(lang);
  };

  const t = (key: string, fallback?: string) => {
    if (translations[key] && translations[key][language]) {
      return translations[key][language];
    }
    return fallback || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
