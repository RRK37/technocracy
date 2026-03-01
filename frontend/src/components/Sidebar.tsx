'use client';

import { useState, useCallback } from 'react';
import { useAgentStore, type Phase } from '@/src/store/agentStore';
import ResultsPanel from './ResultsPanel';
import AgentCard from './AgentCard';
import AgentDetailModal from './AgentDetailModal';
import HistoryPanel from './HistoryPanel';
import { runDeliberation, processFollowUps } from '@/src/lib/orchestrator';
import type { SimAgent } from '@/src/lib/SimAgent';

interface SidebarProps {
    simAgentsRef: React.MutableRefObject<SimAgent[]>;
    extractMemories?: (messages: { role: string; text: string }[], question: string) => void;
}

export default function Sidebar({ simAgentsRef, extractMemories }: SidebarProps) {
    const {
        question, phase, agents, clusteredResults, messages,
        sidebarTab, setSidebarTab,
        selectedAgentId, setSelectedAgentId,
        addMessage, queueMessage, resetSession,
    } = useAgentStore();

    const [input, setInput] = useState('');
    const [running, setRunning] = useState(false);
    const hasAsked = question !== '';
    const isBusy = phase !== 'idle' && phase !== 'complete';

    const handleSubmit = useCallback(async () => {
        if (!input.trim()) return;
        const text = input.trim();
        setInput('');

        if (!hasAsked) {
            // First message = initial question → full deliberation
            addMessage({ role: 'user', text });
            setRunning(true);
            try {
                await runDeliberation(simAgentsRef.current, text);
            } catch (err) {
                console.error('Deliberation error:', err);
            }
            setRunning(false);
        } else if (isBusy || running) {
            // Pipeline is running → queue the message for the next phase boundary
            queueMessage(text);
            // Show it in the thread immediately
            addMessage({ role: 'user', text });
        } else {
            // Pipeline is idle → run follow-up immediately
            addMessage({ role: 'user', text });
            queueMessage(text);
            setRunning(true);
            try {
                await processFollowUps(simAgentsRef.current);
            } catch (err) {
                console.error('Follow-up error:', err);
            }
            setRunning(false);
        }
    }, [input, simAgentsRef, hasAsked, isBusy, running, addMessage, queueMessage]);

    const handleNewQuestion = useCallback(() => {
        if (extractMemories) {
            extractMemories(messages, question);
        }
        resetSession();
        setInput('');
        setRunning(false);
    }, [resetSession, extractMemories, messages, question]);

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
                <div className="sidebar-header-row">
                    <div>
                        <h1 className="sidebar-title">Technocracy</h1>
                        <p className="sidebar-subtitle">Crowd deliberation engine</p>
                    </div>
                    {hasAsked && (
                        <button className="new-question-btn" onClick={handleNewQuestion} disabled={running}>
                            New Question
                        </button>
                    )}
                </div>
            </div>

            {/* Conversation thread + Input */}
            <div className="question-section">
                {/* Message thread */}
                {messages.length > 0 && (
                    <div className="message-thread">
                        {messages.map((msg, i) => (
                            <div key={i} className={`thread-msg thread-msg-${msg.role}`}>
                                <span className="thread-role">{msg.role === 'user' ? 'You' : 'System'}</span>
                                <span className="thread-text">{msg.text}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Phase indicator */}
                {phase !== 'idle' && phase !== 'complete' && (
                    <div className="phase-indicator">
                        {phaseLabel[phase]}
                    </div>
                )}

                {/* Input — always enabled, queues when busy */}
                <div className="question-input-wrap">
                    <textarea
                        className="question-input"
                        placeholder={
                            !hasAsked
                                ? 'Ask the crowd a question...'
                                : isBusy || running
                                    ? 'Type a follow-up (will be processed next)...'
                                    : 'Send a follow-up message...'
                        }
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSubmit();
                            }
                        }}
                        rows={2}
                    />
                    <button
                        className="question-submit"
                        onClick={handleSubmit}
                        disabled={!input.trim()}
                    >
                        →
                    </button>
                </div>
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
