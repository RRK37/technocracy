'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import { supabase } from '@/src/lib/supabase';

interface AgentCreateModalProps {
    onClose: () => void;
}

export default function AgentCreateModal({ onClose }: AgentCreateModalProps) {
    const [spriteId, setSpriteId] = useState(1);
    const [name, setName] = useState('');
    const [persona, setPersona] = useState('');
    const [saving, setSaving] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { addCustomAgent } = useAgentStore();

    // Draw sprite preview
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const padded = String(spriteId).padStart(4, '0');
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const frameW = img.width / 2;
            const frameH = img.height / 4;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 2 * frameH, frameW, frameH, 0, 0, canvas.width, canvas.height);
        };
        img.onerror = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ccc';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        };
        img.src = `/characters/character_${padded}/idle.png`;
    }, [spriteId]);

    const handleCreate = useCallback(async () => {
        if (!name.trim() || !persona.trim() || saving) return;
        setSaving(true);

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            const res = await fetch('/api/agents/custom', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`,
                },
                body: JSON.stringify({
                    name: name.trim(),
                    persona: persona.trim(),
                    sprite_id: spriteId,
                }),
            });

            if (res.ok) {
                const agent = await res.json();
                addCustomAgent(agent);
                onClose();
            }
        } catch (err) {
            console.error('Failed to create agent:', err);
        }
        setSaving(false);
    }, [name, persona, spriteId, saving, addCustomAgent, onClose]);

    const canCreate = name.trim() && persona.trim() && !saving;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <button className="modal-close" onClick={onClose}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>

                <div className="modal-section">
                    <h3>Create Agent</h3>
                </div>

                {/* Sprite browser */}
                <div className="sprite-browser">
                    <button
                        className="sprite-nav-btn"
                        onClick={() => setSpriteId((s) => Math.max(1, s - 1))}
                        disabled={spriteId <= 1}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M8 1L3 6L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>

                    <div className="sprite-preview-wrap">
                        <canvas
                            ref={canvasRef}
                            width={80}
                            height={80}
                            className="sprite-preview-canvas"
                        />
                        <span className="sprite-counter">{spriteId} / 1000</span>
                    </div>

                    <button
                        className="sprite-nav-btn"
                        onClick={() => setSpriteId((s) => Math.min(1000, s + 1))}
                        disabled={spriteId >= 1000}
                    >
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M4 1L9 6L4 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                </div>

                {/* Name input */}
                <div className="modal-section">
                    <h3>Name</h3>
                    <input
                        className="create-agent-input"
                        placeholder="Agent name..."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={50}
                    />
                </div>

                {/* Persona textarea */}
                <div className="modal-section">
                    <h3>Persona</h3>
                    <textarea
                        className="create-agent-textarea"
                        placeholder="Describe this agent's personality, background, and perspective..."
                        value={persona}
                        onChange={(e) => setPersona(e.target.value)}
                        rows={4}
                        maxLength={500}
                    />
                </div>

                {/* Create button */}
                <button
                    className="create-agent-btn"
                    onClick={handleCreate}
                    disabled={!canCreate}
                >
                    {saving ? 'Creating...' : 'Create Agent'}
                </button>
            </div>
        </div>
    );
}
