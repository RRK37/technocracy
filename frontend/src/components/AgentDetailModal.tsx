'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useAgentStore } from '@/src/store/agentStore';

interface AgentDetailModalProps {
    agentId: string;
    onClose: () => void;
}

export default function AgentDetailModal({ agentId, onClose }: AgentDetailModalProps) {
    const agent = useAgentStore((s) => s.agents.find((a) => a.id === agentId));
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [chatInput, setChatInput] = useState('');
    const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'agent'; text: string }[]>([]);
    const [chatting, setChatting] = useState(false);

    // Draw portrait
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !agent) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const frameW = img.width / 2;
            const frameH = img.height / 4;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 2 * frameH, frameW, frameH, 0, 0, canvas.width, canvas.height);
        };
        img.src = `/characters/${agentId}/idle.png`;
    }, [agentId, agent]);

    const handleChat = useCallback(async () => {
        if (!chatInput.trim() || chatting || !agent) return;
        setChatting(true);
        const userMsg = chatInput.trim();
        setChatInput('');
        setChatMessages((prev) => [...prev, { role: 'user', text: userMsg }]);

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: agent.data.name,
                    persona: agent.data.persona,
                    trace: agent.trace,
                    answer: agent.answer,
                    userMessage: userMsg,
                }),
            });

            if (res.ok) {
                const data = await res.json();
                if (data?.reply) {
                    setChatMessages((prev) => [...prev, { role: 'agent', text: data.reply }]);
                }
            }
        } catch (err) {
            console.error('Chat error:', err);
        }
        setChatting(false);
    }, [chatInput, chatting, agent]);

    if (!agent) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>✕</button>

                {/* Header */}
                <div className="modal-header">
                    <canvas ref={canvasRef} width={80} height={80} className="modal-avatar" />
                    <div>
                        <h2 className="modal-name">{agent.data.name || `Agent ${agent.data.id}`}</h2>
                        <p className="modal-desc">{agent.data.description}</p>
                    </div>
                </div>

                {/* Persona */}
                <div className="modal-section">
                    <h3>Persona</h3>
                    <p className="modal-persona">{agent.data.persona}</p>
                </div>

                {/* Current Answer */}
                {agent.answer && (
                    <div className="modal-section">
                        <h3>Current Answer</h3>
                        <p className="modal-answer">{agent.answer}</p>
                    </div>
                )}

                {/* Trace */}
                {agent.trace.length > 0 && (
                    <div className="modal-section">
                        <h3>Thinking Trace</h3>
                        <div className="modal-trace">
                            {agent.trace.map((entry, i) => (
                                <div key={i} className="trace-entry">
                                    <span className="trace-num">#{i + 1}</span>
                                    <p>{entry}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Chat */}
                <div className="modal-section">
                    <h3>Talk to {agent.data.name}</h3>
                    <div className="modal-chat">
                        {chatMessages.map((msg, i) => (
                            <div key={i} className={`chat-msg ${msg.role}`}>
                                <span className="chat-role">{msg.role === 'user' ? 'You' : agent.data.name}:</span>
                                <span className="chat-text">{msg.text}</span>
                            </div>
                        ))}
                    </div>
                    <div className="chat-input-wrap">
                        <input
                            className="chat-input"
                            placeholder={`Say something to ${agent.data.name}...`}
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleChat();
                            }}
                            disabled={chatting}
                        />
                        <button className="chat-send" onClick={handleChat} disabled={chatting}>
                            Send
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
