'use client';

import { useState, useCallback, useRef } from 'react';
import { useAgentStore, type Phase } from '@/src/store/agentStore';
import ResultsPanel from './ResultsPanel';
import AgentCard from './AgentCard';
import AgentDetailModal from './AgentDetailModal';
import HistoryPanel from './HistoryPanel';
import { runDeliberation } from '@/src/lib/orchestrator';
import type { SimAgent } from '@/src/lib/SimAgent';

interface SidebarProps {
    simAgentsRef: React.MutableRefObject<SimAgent[]>;
}

export default function Sidebar({ simAgentsRef }: SidebarProps) {
    const {
        question, phase, agents, clusteredResults,
        sidebarTab, setSidebarTab,
        selectedAgentId, setSelectedAgentId,
    } = useAgentStore();

    const [input, setInput] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = useCallback(async () => {
        if (!input.trim() || submitting) return;
        setSubmitting(true);
        try {
            await runDeliberation(simAgentsRef.current, input.trim());
        } catch (err) {
            console.error('Deliberation error:', err);
        }
        setSubmitting(false);
    }, [input, submitting, simAgentsRef]);

    const phaseLabel: Record<Phase, string> = {
        idle: '',
        thinking: '🧠 Thinking...',
        discussing: '💬 Discussing...',
        're-thinking': '🧠 Reconsidering...',
        clustering: '📊 Analyzing...',
        complete: '✅ Complete',
    };

    return (
        <div className="sidebar">
            {/* Header */}
            <div className="sidebar-header">
                <h1 className="sidebar-title">Technocracy</h1>
                <p className="sidebar-subtitle">Crowd deliberation engine</p>
            </div>

            {/* Question Input */}
            <div className="question-section">
                <div className="question-input-wrap">
                    <textarea
                        className="question-input"
                        placeholder="Ask the crowd a question..."
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        disabled={submitting}
                        rows={2}
                    />
                    <button
                        className="question-submit"
                        onClick={handleSubmit}
                        disabled={submitting || !input.trim()}
                    >
                        {submitting ? '...' : '→'}
                    </button>
                </div>

                {/* Phase indicator */}
                {phase !== 'idle' && (
                    <div className="phase-indicator">
                        {phaseLabel[phase]}
                    </div>
                )}

                {/* Current question */}
                {question && (
                    <div className="current-question">
                        <span className="current-question-label">Q:</span> {question}
                    </div>
                )}
            </div>

            {/* Tab bar */}
            <div className="tab-bar">
                {(['results', 'agents', 'history'] as const).map((tab) => (
                    <button
                        key={tab}
                        className={`tab-btn ${sidebarTab === tab ? 'active' : ''}`}
                        onClick={() => setSidebarTab(tab)}
                    >
                        {tab === 'results' ? '📊 Results' : tab === 'agents' ? '👥 Agents' : '📜 History'}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="tab-content">
                {sidebarTab === 'results' && (
                    <ResultsPanel
                        question={question}
                        clusters={clusteredResults}
                        phase={phase}
                        totalAgents={agents.length}
                    />
                )}

                {sidebarTab === 'agents' && (
                    <div className="agents-grid">
                        {agents.map((agent) => (
                            <AgentCard
                                key={agent.id}
                                agent={agent}
                                onClick={() => setSelectedAgentId(agent.id)}
                            />
                        ))}
                    </div>
                )}

                {sidebarTab === 'history' && <HistoryPanel />}
            </div>

            {/* Agent detail modal */}
            {selectedAgentId && (
                <AgentDetailModal
                    agentId={selectedAgentId}
                    onClose={() => setSelectedAgentId(null)}
                />
            )}
        </div>
    );
}
