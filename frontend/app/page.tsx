'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/providers/AuthProvider';
import WorldCanvas from '@/src/components/WorldCanvas';
import Sidebar from '@/src/components/Sidebar';
import AgentDetailModal from '@/src/components/AgentDetailModal';
import type { SimAgent } from '@/src/lib/SimAgent';
import { useMemoryExtraction } from '@/src/hooks/useMemoryExtraction';
import { useAgentStore } from '@/src/store/agentStore';

export default function HomePage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const simAgentsRef = useRef<SimAgent[]>([]);
  const { extractMemories } = useMemoryExtraction();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { selectedAgentId, setSelectedAgentId } = useAgentStore();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleAgentsReady = useCallback((agents: SimAgent[]) => {
    simAgentsRef.current = agents;
  }, []);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner" />
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className={`app-layout${sidebarOpen ? ' sidebar-open' : ''}`}>
      <div className="canvas-area">
        <WorldCanvas onAgentsReady={handleAgentsReady} />
      </div>

      <button
        className="mobile-sidebar-toggle"
        onClick={() => setSidebarOpen(o => !o)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="5" x2="17" y2="5" /><line x1="3" y1="10" x2="17" y2="10" /><line x1="3" y1="15" x2="17" y2="15" />
          </svg>
        )}
      </button>

      <Sidebar simAgentsRef={simAgentsRef} extractMemories={extractMemories} onSignOut={signOut} />

      {selectedAgentId && (
        <AgentDetailModal agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} />
      )}
    </div>
  );
}
