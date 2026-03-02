'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import { supabase } from '@/src/lib/supabase';
import { SimAgent } from '@/src/lib/SimAgent';
import { WORLD_CONFIG } from '@/src/lib/world';
import type { CharacterData, AgentRuntime } from '@/src/types/agent';

interface AgentCreateModalProps {
    onClose: () => void;
    simAgentsRef: React.MutableRefObject<SimAgent[]>;
}

export default function AgentCreateModal({ onClose, simAgentsRef }: AgentCreateModalProps) {
    const [spriteId, setSpriteId] = useState(1);
    const [name, setName] = useState('');
    const [persona, setPersona] = useState('');
    const [saving, setSaving] = useState(false);
    const [showLinkedinPopup, setShowLinkedinPopup] = useState(false);
    const [linkedinUrl, setLinkedinUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState('');
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

    const handleImport = useCallback(async () => {
        if (!linkedinUrl.trim() || importing) return;
        setImporting(true);
        setImportError('');
        try {
            const res = await fetch('/api/linkedin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ linkedinUrl: linkedinUrl.trim() }),
            });
            const data = await res.json();
            if (res.ok) {
                setName(data.name || '');
                setPersona(data.persona || '');
                setLinkedinUrl('');
                setShowLinkedinPopup(false);
            } else {
                setImportError(data.error || 'Import failed');
            }
        } catch {
            setImportError('Network error — could not reach server');
        }
        setImporting(false);
    }, [linkedinUrl, importing]);

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

                // Create SimAgent and AgentRuntime so it appears immediately
                const padded = String(agent.sprite_id).padStart(4, '0');
                const spriteKey = `character_${padded}`;
                const customData: CharacterData = {
                    id: agent.sprite_id,
                    gender: 'male',
                    description: agent.persona,
                    name: agent.name,
                    persona: agent.persona,
                    attributes: {
                        skin_color: '', hair_color: '', hair_style: '',
                        shirt_color: '', leg_color: '', leg_type: 'pants', shoe_color: '',
                    },
                    sprites: {
                        idle: { url: `/characters/${spriteKey}/idle.png`, generated: '', layers: [] },
                        walk: { url: `/characters/${spriteKey}/walk.png`, generated: '', layers: [] },
                        sit: { url: `/characters/${spriteKey}/sit.png`, generated: '', layers: [] },
                    },
                };

                const x = Math.random() * (WORLD_CONFIG.WIDTH - 100) + 50;
                const y = Math.random() * (WORLD_CONFIG.HEIGHT - 100) + 50;
                const simAgent = new SimAgent(customData, x, y, `custom_${agent.id}`);
                simAgentsRef.current.push(simAgent);

                const runtime: AgentRuntime = {
                    id: simAgent.id,
                    data: customData,
                    trace: [],
                    answer: '',
                    thoughtBubble: '',
                    conversationBubble: '',
                };
                const store = useAgentStore.getState();
                store.setAgents([...store.agents, runtime]);

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

                {/* Name input + LinkedIn trigger */}
                <div className="modal-section">
                    <h3>Name</h3>
                    <div className="name-field-row">
                        <input
                            className="create-agent-input"
                            placeholder="Agent name..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            maxLength={50}
                        />
                        <button
                            className="linkedin-trigger-btn"
                            onClick={() => setShowLinkedinPopup((v) => !v)}
                            title="Import from LinkedIn"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
                            </svg>
                        </button>
                    </div>
                    {showLinkedinPopup && (
                        <div className="linkedin-popup">
                            <div className="linkedin-popup-input-row">
                                <input
                                    className="create-agent-input"
                                    placeholder="linkedin.com/in/username"
                                    value={linkedinUrl}
                                    onChange={(e) => { setLinkedinUrl(e.target.value); setImportError(''); }}
                                    disabled={importing}
                                />
                                <button
                                    className="linkedin-import-btn"
                                    onClick={handleImport}
                                    disabled={importing || !linkedinUrl.trim()}
                                >
                                    {importing ? '...' : 'Import'}
                                </button>
                            </div>
                            {importError && <p className="linkedin-import-error">{importError}</p>}
                            {importing && <p className="linkedin-importing-text">Importing profile...</p>}
                        </div>
                    )}
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
