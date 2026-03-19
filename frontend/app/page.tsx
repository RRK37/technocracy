'use client';

import { useCallback, useRef, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/providers/AuthProvider';
import WorldCanvas from '@/src/components/WorldCanvas';
import FloatingPanel from '@/src/components/FloatingPanel';
import ChatBubble from '@/src/components/ChatBubble';
import AgentDetailModal from '@/src/components/AgentDetailModal';
import type { SimAgent } from '@/src/lib/SimAgent';
import { useMemoryExtraction } from '@/src/hooks/useMemoryExtraction';
import { useAgentStore } from '@/src/store/agentStore';

export default function HomePage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const simAgentsRef = useRef<SimAgent[]>([]);
  const { extractMemories } = useMemoryExtraction();
  const { selectedAgentId, setSelectedAgentId } = useAgentStore();
  const [panelHeight, setPanelHeight] = useState(72);
  const [panelDragging, setPanelDragging] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const handleAgentsReady = useCallback((agents: SimAgent[]) => {
    simAgentsRef.current = agents;
  }, []);

  const handlePanelHeightChange = useCallback((h: number, dragging: boolean) => {
    setPanelHeight(h);
    setPanelDragging(dragging);
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
    <div className="app-layout">
      <div className="canvas-area">
        <WorldCanvas onAgentsReady={handleAgentsReady} />
      </div>

      <FloatingPanel simAgentsRef={simAgentsRef} onSignOut={signOut} onHeightChange={handlePanelHeightChange} />

      <ChatBubble simAgentsRef={simAgentsRef} extractMemories={extractMemories} panelHeight={panelHeight} panelDragging={panelDragging} />

      {selectedAgentId && (
        <AgentDetailModal agentId={selectedAgentId} onClose={() => setSelectedAgentId(null)} />
      )}
    </div>
  );
}
