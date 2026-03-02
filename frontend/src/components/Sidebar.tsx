'use client';

import { useState, useCallback } from 'react';
import { useAgentStore, type Phase } from '@/src/store/agentStore';
import ResultsPanel from './ResultsPanel';
import AgentCard from './AgentCard';
import AgentDetailModal from './AgentDetailModal';
import HistoryPanel from './HistoryPanel';
import { runDeliberation, processFollowUps, saveAndReset } from '@/src/lib/orchestrator';
import type { SimAgent } from '@/src/lib/SimAgent';
import { useVoiceInput } from '@/src/hooks/useVoiceInput';

interface SidebarProps {
    simAgentsRef: React.MutableRefObject<SimAgent[]>;
    extractMemories?: (messages: { role: string; text: string }[], question: string) => void;
    onSignOut?: () => void;
}

export default function Sidebar({ simAgentsRef, extractMemories, onSignOut }: SidebarProps) {
    const {
        question, phase, agents, clusteredResults, messages,
        sidebarTab, setSidebarTab,
        selectedAgentId, setSelectedAgentId,
        addMessage, queueMessage, resetSession,
    } = useAgentStore();

    const [input, setInput] = useState('');
    const [running, setRunning] = useState(false);
    const { isRecording, isTranscribing, toggleRecording } = useVoiceInput(
        useCallback((text: string) => setInput((prev) => (prev ? prev + ' ' + text : text)), []),
    );
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

    const handleNewQuestion = useCallback(async () => {
        if (extractMemories) {
            extractMemories(messages, question);
        }
        await saveAndReset(simAgentsRef.current);
        setInput('');
        setRunning(false);
    }, [simAgentsRef, extractMemories, messages, question]);

    const phaseLabel: Record<Phase, string> = {
        idle: '',
        thinking: 'Thinking...',
        discussing: 'Discussing...',
        're-thinking': 'Reconsidering...',
        clustering: 'Analyzing...',
        complete: 'Complete',
    };

    return (
        <div className="sidebar">
            {/* Header */}
            <div className="sidebar-header">
                <div className="sidebar-header-row">
                    <div>
                        <img src="/logo-black.png" alt="Technocracy" className="sidebar-logo" />
                        <p className="sidebar-subtitle">Collective intelligence engine</p>
                    </div>
                    {hasAsked && (
                        <button className="new-question-btn" onClick={handleNewQuestion}>
                            + New
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
                    <div className="input-actions">
                        <button
                            className={`voice-btn${isRecording ? ' recording' : ''}${isTranscribing ? ' transcribing' : ''}`}
                            onClick={toggleRecording}
                            disabled={isTranscribing}
                            title={isRecording ? 'Stop recording' : isTranscribing ? 'Transcribing...' : 'Voice input'}
                        >
                            {isTranscribing ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5"/><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            ) : isRecording ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>
                            ) : (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                            )}
                        </button>
                        <button
                            className={`question-submit${input.trim() ? ' has-input' : ''}`}
                            onClick={handleSubmit}
                            disabled={!input.trim()}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                    </div>
                </div>
            </div>

            {/* Tab bar — segmented control */}
            <div className="tab-bar">
                <div className="tab-bar-inner">
                    {(['results', 'agents', 'history'] as const).map((tab) => (
                        <button
                            key={tab}
                            className={`tab-btn ${sidebarTab === tab ? 'active' : ''}`}
                            onClick={() => setSidebarTab(tab)}
                        >
                            {tab === 'results' ? 'Results' : tab === 'agents' ? 'Agents' : 'History'}
                        </button>
                    ))}
                </div>
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

            {/* Sidebar footer with sign out */}
            {onSignOut && (
                <div className="sidebar-footer">
                    <button className="sidebar-signout" onClick={onSignOut}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/><line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        Sign out
                    </button>
                </div>
            )}

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
