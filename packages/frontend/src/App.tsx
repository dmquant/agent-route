import { Routes, Route } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './pages/Dashboard';
import { Agents } from './pages/Agents';
import { Workflows } from './pages/Workflows';
import { Routines } from './pages/Routines';
import { Chat } from './pages/Chat';

export default function App() {
  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden font-sans dark custom-scrollbar">
      <Sidebar />
      <main className="flex-1 overflow-hidden relative bg-gradient-to-b from-background to-background/80">
        {/* decorative background element */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/agents" element={<Agents />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/routines" element={<Routines />} />
          <Route path="/chat" element={<Chat />} />
        </Routes>
      </main>
    </div>
  );
}
