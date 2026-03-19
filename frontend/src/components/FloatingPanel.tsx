'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import ResultsPanel from './ResultsPanel';
import AgentCard from './AgentCard';
import AgentCreateModal from './AgentCreateModal';
import HistoryPanel from './HistoryPanel';
import type { SimAgent } from '@/src/lib/SimAgent';
import { supabase } from '@/src/lib/supabase';

interface FloatingPanelProps {
    simAgentsRef: React.MutableRefObject<SimAgent[]>;
    onSignOut?: () => void;
    onHeightChange?: (height: number, isDragging: boolean) => void;
}

type PanelState = 'hidden' | 'peek' | 'half' | 'full';

const PEEK_HEIGHT = 72;
const HALF_RATIO = 0.42;
const FULL_RATIO = 0.92;

export default function FloatingPanel({ simAgentsRef, onSignOut, onHeightChange }: FloatingPanelProps) {
    const {
        question, phase, agents, clusteredResults,
        sidebarTab, setSidebarTab,
        selectedAgentId, setSelectedAgentId,
        customAgents, removeCustomAgent,
    } = useAgentStore();

    const [panelState, setPanelState] = useState<PanelState>('peek');
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [dragOffset, setDragOffset] = useState<number | null>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const dragStartY = useRef(0);
    const dragStartHeight = useRef(0);
    const isDragging = useRef(false);

    const hasResults = question !== '' || clusteredResults.length > 0;

    // Compute current height based on state
    const getTargetHeight = useCallback((state: PanelState) => {
        if (typeof window === 'undefined') return PEEK_HEIGHT;
        const vh = window.innerHeight;
        switch (state) {
            case 'hidden': return 0;
            case 'peek': return PEEK_HEIGHT;
            case 'half': return vh * HALF_RATIO;
            case 'full': return vh * FULL_RATIO;
        }
    }, []);

    // Snap to nearest state based on height
    const snapToNearest = useCallback((height: number) => {
        const vh = window.innerHeight;
        const thresholds = [
            { state: 'hidden' as PanelState, h: 0 },
            { state: 'peek' as PanelState, h: PEEK_HEIGHT },
            { state: 'half' as PanelState, h: vh * HALF_RATIO },
            { state: 'full' as PanelState, h: vh * FULL_RATIO },
        ];

        // Find closest
        let best = thresholds[0];
        let bestDist = Math.abs(height - best.h);
        for (const t of thresholds) {
            const d = Math.abs(height - t.h);
            if (d < bestDist) {
                best = t;
                bestDist = d;
            }
        }
        return best.state;
    }, []);

    // Touch/mouse drag handlers
    const handleDragStart = useCallback((clientY: number) => {
        isDragging.current = true;
        dragStartY.current = clientY;
        dragStartHeight.current = getTargetHeight(panelState);
        document.body.style.userSelect = 'none';
        document.body.style.touchAction = 'none';
    }, [panelState, getTargetHeight]);

    const handleDragMove = useCallback((clientY: number) => {
        if (!isDragging.current) return;
        const delta = dragStartY.current - clientY;
        const newHeight = Math.max(0, Math.min(window.innerHeight * 0.95, dragStartHeight.current + delta));
        setDragOffset(newHeight);
    }, []);

    const handleDragEnd = useCallback(() => {
        if (!isDragging.current) return;
        isDragging.current = false;
        document.body.style.userSelect = '';
        document.body.style.touchAction = '';

        if (dragOffset !== null) {
            const newState = snapToNearest(dragOffset);
            setPanelState(newState);
            setDragOffset(null);
        }
    }, [dragOffset, snapToNearest]);

    // Mouse events
    const onMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        handleDragStart(e.clientY);
    }, [handleDragStart]);

    // Touch events
    const onTouchStart = useCallback((e: React.TouchEvent) => {
        handleDragStart(e.touches[0].clientY);
    }, [handleDragStart]);

    // Global move/end listeners
    useEffect(() => {
        const onMove = (e: MouseEvent) => handleDragMove(e.clientY);
        const onTouchMove = (e: TouchEvent) => {
            if (isDragging.current) {
                e.preventDefault();
                handleDragMove(e.touches[0].clientY);
            }
        };
        const onUp = () => handleDragEnd();

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        window.addEventListener('touchmove', onTouchMove, { passive: false });
        window.addEventListener('touchend', onUp);

        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            window.removeEventListener('touchmove', onTouchMove);
            window.removeEventListener('touchend', onUp);
        };
    }, [handleDragMove, handleDragEnd]);

    // Auto-expand to half when results arrive
    useEffect(() => {
        if (hasResults && panelState === 'peek') {
            setPanelState('half');
        }
    }, [hasResults]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleDeleteCustomAgent = useCallback(async (agentId: string) => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const res = await fetch(`/api/agents/custom?id=${agentId}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` },
            });
            if (res.ok) {
                removeCustomAgent(agentId);
            }
        } catch (err) {
            console.error('Failed to delete agent:', err);
        }
    }, [removeCustomAgent]);

    const customAgentIds = new Set(customAgents.map((ca) => `custom_${ca.id}`));

    const currentHeight = dragOffset !== null
        ? dragOffset
        : getTargetHeight(panelState);

    // Report height changes to parent
    useEffect(() => {
        onHeightChange?.(currentHeight, dragOffset !== null);
    }, [currentHeight, dragOffset, onHeightChange]);

    const isExpanded = panelState === 'half' || panelState === 'full' || (dragOffset !== null && dragOffset > PEEK_HEIGHT + 40);
    const showTabs = panelState === 'half' || panelState === 'full' || (dragOffset !== null && dragOffset > 200);

    // Toggle expand on handle double-tap / click
    const handleToggle = useCallback(() => {
        if (panelState === 'hidden') setPanelState('peek');
        else if (panelState === 'peek') setPanelState('half');
        else if (panelState === 'half') setPanelState('full');
        else setPanelState('half');
    }, [panelState]);

    return (
        <>
            <div
                ref={panelRef}
                className={`floating-panel ${panelState === 'hidden' ? 'panel-hidden' : ''}`}
                style={{
                    height: currentHeight,
                    transition: dragOffset !== null ? 'none' : 'height 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
                }}
            >
                {/* Drag handle */}
                <div
                    className="panel-handle-zone"
                    onMouseDown={onMouseDown}
                    onTouchStart={onTouchStart}
                    onDoubleClick={handleToggle}
                >
                    <div className="panel-handle" />

                    {/* Peek content: question preview or status */}
                    {!isExpanded && (
                        <div className="panel-peek-content">
                            {question ? (
                                <span className="panel-peek-question">{question}</span>
                            ) : (
                                <span className="panel-peek-idle">Ask the crowd a question</span>
                            )}
                            {phase !== 'idle' && phase !== 'complete' && (
                                <span className="panel-peek-phase">{phase}</span>
                            )}
                        </div>
                    )}
                </div>

                {/* Expanded content */}
                <div className="panel-body" style={{ opacity: isExpanded ? 1 : 0, pointerEvents: isExpanded ? 'auto' : 'none' }}>
                    {/* Tab content */}
                    <div className="panel-content-scroll">
                        <div className={`panel-tab-pane ${sidebarTab === 'results' ? 'active' : ''}`}>
                            <ResultsPanel
                                question={question}
                                clusters={clusteredResults}
                                phase={phase}
                                totalAgents={agents.length}
                            />
                        </div>

                        <div className={`panel-tab-pane ${sidebarTab === 'agents' ? 'active' : ''}`}>
                            <div>
                                {/* Your Agents section */}
                                <div className="agents-section">
                                    <div className="agents-section-header">
                                        <span className="agents-section-title">Your Agents</span>
                                        <button className="add-agent-btn-sm" onClick={() => setShowCreateModal(true)} title="Create agent">
                                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                                <path d="M6 2V10M2 6H10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="agents-grid">
                                        {agents
                                            .filter((a) => customAgentIds.has(a.id))
                                            .map((agent) => (
                                                <div key={agent.id} className="custom-agent-wrapper">
                                                    <AgentCard
                                                        agent={agent}
                                                        onClick={() => setSelectedAgentId(agent.id)}
                                                    />
                                                    <button
                                                        className="custom-agent-delete"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleDeleteCustomAgent(agent.id.replace('custom_', ''));
                                                        }}
                                                        title="Delete custom agent"
                                                    >
                                                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                                            <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            ))}
                                        {customAgentIds.size === 0 && (
                                            <button className="add-agent-btn" onClick={() => setShowCreateModal(true)}>
                                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                                </svg>
                                                Create your first agent
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Crowd section */}
                                <div className="agents-section">
                                    <div className="agents-section-header">
                                        <span className="agents-section-title">Crowd</span>
                                        <span className="agents-section-count">{agents.filter((a) => !customAgentIds.has(a.id)).length}</span>
                                    </div>
                                    <div className="agents-grid">
                                        {agents
                                            .filter((a) => !customAgentIds.has(a.id))
                                            .map((agent) => (
                                                <AgentCard
                                                    key={agent.id}
                                                    agent={agent}
                                                    onClick={() => setSelectedAgentId(agent.id)}
                                                />
                                            ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className={`panel-tab-pane ${sidebarTab === 'history' ? 'active' : ''}`}>
                            <HistoryPanel />
                        </div>
                    </div>

                    {/* Tab bar at bottom of panel */}
                    {showTabs && (
                        <div className="panel-tab-bar">
                            {(['results', 'agents', 'history'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    className={`panel-tab-btn ${sidebarTab === tab ? 'active' : ''}`}
                                    onClick={() => setSidebarTab(tab)}
                                >
                                    {tab === 'results' && (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                            <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <path d="M7 16l4-5 4 3 5-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                    {tab === 'agents' && (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                            <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.5" />
                                            <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                    {tab === 'history' && (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" />
                                            <path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        </svg>
                                    )}
                                    <span>{tab === 'results' ? 'Results' : tab === 'agents' ? 'Agents' : 'History'}</span>
                                </button>
                            ))}

                            {/* Sign out in tab bar */}
                            {onSignOut && (
                                <button className="panel-tab-btn signout-btn" onClick={onSignOut} title="Sign out">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                        <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Desktop expand/collapse button */}
            {panelState === 'hidden' && (
                <button
                    className="panel-restore-btn"
                    onClick={() => setPanelState('peek')}
                    title="Show panel"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M18 15l-6-6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                </button>
            )}

            {showCreateModal && (
                <AgentCreateModal onClose={() => setShowCreateModal(false)} simAgentsRef={simAgentsRef} />
            )}
        </>
    );
}
