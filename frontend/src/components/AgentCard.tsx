'use client';

import { useEffect, useRef } from 'react';
import type { AgentRuntime } from '@/src/types/agent';

interface AgentCardProps {
    agent: AgentRuntime;
    onClick: () => void;
}

export default function AgentCard({ agent, onClick }: AgentCardProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Draw face-shot from idle sprite (first frame, facing down)
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const frameW = img.width / 2;  // idle: 2 columns
            const frameH = img.height / 4; // 4 direction rows
            // Row 2 (index 2) = facing down, Col 0
            const sx = 0;
            const sy = 2 * frameH;

            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, sx, sy, frameW, frameH, 0, 0, canvas.width, canvas.height);
        };

        const charId = agent.id; // e.g. "character_0001"
        img.src = `/characters/${charId}/idle.png`;
    }, [agent.id]);

    return (
        <button className="agent-card" onClick={onClick}>
            <canvas
                ref={canvasRef}
                width={48}
                height={48}
                className="agent-card-avatar"
            />
            <div className="agent-card-info">
                <span className="agent-card-name">{agent.data.name || `Agent ${agent.data.id}`}</span>
                {agent.answer && (
                    <span className="agent-card-answer">{agent.answer.slice(0, 40)}...</span>
                )}
            </div>
        </button>
    );
}
