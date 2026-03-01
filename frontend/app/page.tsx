'use client';

import { useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/src/providers/AuthProvider';
import WorldCanvas from '@/src/components/WorldCanvas';
import Sidebar from '@/src/components/Sidebar';
import type { SimAgent } from '@/src/lib/SimAgent';
import { useMemoryExtraction } from '@/src/hooks/useMemoryExtraction';

export default function HomePage() {
  const { user, loading, signOut } = useAuth();
  const router = useRouter();
  const simAgentsRef = useRef<SimAgent[]>([]);
  const { extractMemories } = useMemoryExtraction();

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
    <div className="app-layout">
      <div className="canvas-area">
        <WorldCanvas onAgentsReady={handleAgentsReady} />

        {/* Sign out button */}
        <button className="signout-btn" onClick={signOut}>
          Sign Out
        </button>
      </div>

      <Sidebar simAgentsRef={simAgentsRef} extractMemories={extractMemories} />
    </div>
  );
}
