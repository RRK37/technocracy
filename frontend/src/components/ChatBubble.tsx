'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import { runDeliberation, processFollowUps, saveAndReset } from '@/src/lib/orchestrator';
import type { SimAgent } from '@/src/lib/SimAgent';
import { useVoiceInput } from '@/src/hooks/useVoiceInput';

interface ChatBubbleProps {
    simAgentsRef: React.MutableRefObject<SimAgent[]>;
    extractMemories?: (messages: { role: string; text: string }[], question: string) => void;
    panelHeight: number;
    panelDragging?: boolean;
}

export default function ChatBubble({ simAgentsRef, extractMemories, panelHeight, panelDragging }: ChatBubbleProps) {
    const {
        question, phase, messages,
        addMessage, queueMessage,
    } = useAgentStore();

    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState('');
    const [running, setRunning] = useState(false);
    const [confirmingNew, setConfirmingNew] = useState(false);
    const [quotaError, setQuotaError] = useState<{ used: number; quota: number } | null>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const { isRecording, isTranscribing, toggleRecording } = useVoiceInput(
        useCallback((text: string) => setInput((prev) => (prev ? prev + ' ' + text : text)), []),
    );

    const hasAsked = question !== '';
    const isBusy = phase !== 'idle' && phase !== 'complete';

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        if (isOpen) {
            setTimeout(() => inputRef.current?.focus(), 200);
        }
    }, [isOpen]);

    const handleSubmit = useCallback(async () => {
        if (!input.trim()) return;
        const text = input.trim();
        setInput('');

        if (!hasAsked) {
            addMessage({ role: 'user', text });
            setRunning(true);
            setQuotaError(null);
            try {
                await runDeliberation(simAgentsRef.current, text);
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'quota_exceeded') {
                    const qd = (err as Error & { quotaData: { used: number; quota: number } }).quotaData;
                    setQuotaError(qd);
                } else {
                    console.error('Deliberation error:', err);
                }
            }
            setRunning(false);
        } else if (isBusy || running) {
            queueMessage(text);
            addMessage({ role: 'user', text });
        } else {
            addMessage({ role: 'user', text });
            queueMessage(text);
            setRunning(true);
            setQuotaError(null);
            try {
                await processFollowUps(simAgentsRef.current);
            } catch (err: unknown) {
                if (err instanceof Error && err.message === 'quota_exceeded') {
                    const qd = (err as Error & { quotaData: { used: number; quota: number } }).quotaData;
                    setQuotaError(qd);
                } else {
                    console.error('Follow-up error:', err);
                }
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
        setConfirmingNew(false);
    }, [simAgentsRef, extractMemories, messages, question]);

    return (
        <div
            className={`chat-anchor ${isOpen ? 'chat-open' : ''}${panelDragging ? ' dragging' : ''}`}
            style={{ bottom: panelHeight + 12 }}
        >
            {/* Collapsed: FAB icon */}
            {!isOpen && (
                <button
                    className="chat-fab"
                    onClick={() => setIsOpen(true)}
                    title="Open chat"
                >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    {messages.length > 0 && phase !== 'idle' && (
                        <span className="chat-fab-badge" />
                    )}
                </button>
            )}

            {/* Expanded: chat panel */}
            {isOpen && (
                <div className="chat-panel">
                    <div className="chat-panel-header">
                        <span className="chat-panel-title">Chat</span>
                        <button className="chat-panel-close" onClick={() => setIsOpen(false)}>
                            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                <line x1="4" y1="4" x2="16" y2="16" /><line x1="16" y1="4" x2="4" y2="16" />
                            </svg>
                        </button>
                    </div>

                    <div className="chat-panel-messages">
                        {messages.length === 0 && (
                            <div className="chat-panel-empty">
                                Ask the crowd a question
                            </div>
                        )}
                        {messages.map((msg, i) => (
                            <div key={i} className={`chat-bubble-msg chat-bubble-msg-${msg.role}`}>
                                <span className="chat-bubble-role">{msg.role === 'user' ? 'You' : 'System'}</span>
                                <span className="chat-bubble-text">{msg.text}</span>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </div>

                    {quotaError && (
                        <div className="quota-banner" style={{ margin: '0 16px 8px' }}>
                            <strong>Monthly limit reached</strong>
                            <span>{quotaError.used} / {quotaError.quota} free questions used.</span>
                        </div>
                    )}

                    <div className="chat-panel-input-area">
                        <div className="chat-panel-input-row">
                            <textarea
                                ref={inputRef}
                                className="chat-panel-input"
                                placeholder={
                                    !hasAsked
                                        ? 'Ask the crowd a question...'
                                        : isBusy || running
                                            ? 'Type a follow-up...'
                                            : 'Send a follow-up...'
                                }
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleSubmit();
                                    }
                                }}
                                rows={1}
                            />
                            <div className="chat-panel-actions">
                                {hasAsked && (
                                    confirmingNew ? (
                                        <button
                                            className="chat-action-btn confirming"
                                            onClick={() => { setConfirmingNew(false); handleNewQuestion(); }}
                                            onBlur={() => setConfirmingNew(false)}
                                        >
                                            New?
                                        </button>
                                    ) : (
                                        <button
                                            className="chat-action-btn"
                                            onClick={() => setConfirmingNew(true)}
                                            title="New chat"
                                        >
                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                                <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
                                        </button>
                                    )
                                )}
                                <button
                                    className={`chat-action-btn${isRecording ? ' recording' : ''}${isTranscribing ? ' transcribing' : ''}`}
                                    onClick={toggleRecording}
                                    disabled={isTranscribing}
                                    title={isRecording ? 'Stop recording' : 'Voice input'}
                                >
                                    {isTranscribing ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" /><path d="M12 6v6l4 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                    ) : isRecording ? (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" /></svg>
                                    ) : (
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                                    )}
                                </button>
                                <button
                                    className={`chat-action-btn send${input.trim() ? ' has-input' : ''}`}
                                    onClick={handleSubmit}
                                    disabled={!input.trim()}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M22 2L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
