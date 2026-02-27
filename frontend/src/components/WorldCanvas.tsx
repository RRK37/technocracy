'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { SimAgent } from '@/src/lib/SimAgent';
import { useAgentStore } from '@/src/store/agentStore';
import { WORLD_CONFIG, AGENT_CONFIG, CAMERA_CONFIG, DISCUSSION_CONFIG } from '@/src/lib/world';
import { drawGrid, drawDiscussionCircle } from '@/src/lib/canvas-utils';
import type { CharacterData, CharactersJSON, AgentRuntime } from '@/src/types/agent';

interface WorldCanvasProps {
    onAgentsReady: (agents: SimAgent[]) => void;
}

export default function WorldCanvas({ onAgentsReady }: WorldCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simAgentsRef = useRef<SimAgent[]>([]);
    const animFrameRef = useRef<number>(0);

    // Camera state
    const cameraRef = useRef<{ x: number; y: number; zoom: number }>({ x: 0, y: 0, zoom: CAMERA_CONFIG.DEFAULT_ZOOM });
    const isDragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    const { phase, discussionGroups } = useAgentStore();
    const [loaded, setLoaded] = useState(false);

    // Load character data and create agents
    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                const res = await fetch('/characters/data/all-characters.json');
                const json: CharactersJSON = await res.json();

                if (cancelled) return;

                // Only use characters 1-100
                const allKeys = Object.keys(json.characters).filter((key) => {
                    const num = parseInt(key.replace(/\D/g, ''), 10);
                    return num >= 1 && num <= 100;
                });
                const shuffled = allKeys.sort(() => Math.random() - 0.5);
                const selected = shuffled.slice(0, WORLD_CONFIG.NUM_AGENTS);

                // Fix sprite URLs to point to symlinked public path
                const agents: SimAgent[] = selected.map((key) => {
                    const charData = json.characters[key];
                    // Rewrite URLs to use the public path
                    const fixedData: CharacterData = {
                        ...charData,
                        sprites: {
                            idle: { ...charData.sprites.idle, url: `/characters/${key}/idle.png` },
                            walk: { ...charData.sprites.walk, url: `/characters/${key}/walk.png` },
                            sit: { ...charData.sprites.sit, url: `/characters/${key}/sit.png` },
                        },
                    };

                    const x = Math.random() * (WORLD_CONFIG.WIDTH - 100) + 50;
                    const y = Math.random() * (WORLD_CONFIG.HEIGHT - 100) + 50;
                    return new SimAgent(fixedData, x, y);
                });

                simAgentsRef.current = agents;

                // Create runtime entries in store
                const runtimes: AgentRuntime[] = agents.map((a) => ({
                    id: a.id,
                    data: a.data,
                    trace: [],
                    answer: '',
                    thoughtBubble: '',
                    conversationBubble: '',
                }));
                useAgentStore.getState().setAgents(runtimes);

                setLoaded(true);
                onAgentsReady(agents);
            } catch (err) {
                console.error('Failed to load characters:', err);
            }
        }

        init();
        return () => { cancelled = true; };
    }, [onAgentsReady]);

    // Resize canvas to fill container
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        function resize() {
            const parent = canvas!.parentElement;
            if (!parent) return;
            canvas!.width = parent.clientWidth;
            canvas!.height = parent.clientHeight;
        }

        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    // Game loop
    useEffect(() => {
        if (!loaded) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        function gameLoop() {
            const agents = simAgentsRef.current;
            const cam = cameraRef.current;

            // Update all agents
            for (const agent of agents) {
                agent.update();
            }

            // Clear
            ctx!.clearRect(0, 0, canvas!.width, canvas!.height);

            // Fill background
            ctx!.fillStyle = '#0f0f1a';
            ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

            // Apply camera transform
            ctx!.save();
            ctx!.translate(canvas!.width / 2, canvas!.height / 2);
            ctx!.scale(cam.zoom, cam.zoom);
            ctx!.translate(-cam.x, -cam.y);

            // Draw grid
            drawGrid(ctx!, WORLD_CONFIG.WIDTH, WORLD_CONFIG.HEIGHT);

            // Draw world boundary
            ctx!.strokeStyle = 'rgba(100, 150, 255, 0.15)';
            ctx!.lineWidth = 2;
            ctx!.strokeRect(0, 0, WORLD_CONFIG.WIDTH, WORLD_CONFIG.HEIGHT);

            // Draw discussion circles
            const groups = useAgentStore.getState().discussionGroups;
            for (const group of groups) {
                if (!group.completed) {
                    drawDiscussionCircle(ctx!, group.centerX, group.centerY, DISCUSSION_CONFIG.CIRCLE_RADIUS);
                }
            }

            // Sort agents by Y for proper layering
            const sorted = [...agents].sort((a, b) => a.y - b.y);
            for (const agent of sorted) {
                agent.draw(ctx!);
            }

            ctx!.restore();

            // Draw phase indicator
            const currentPhase = useAgentStore.getState().phase;
            if (currentPhase !== 'idle' && currentPhase !== 'complete') {
                ctx!.save();
                ctx!.fillStyle = 'rgba(100, 200, 255, 0.9)';
                ctx!.font = '14px Inter, sans-serif';
                ctx!.textAlign = 'left';
                const phaseLabels: Record<string, string> = {
                    thinking: '🧠 Agents are thinking...',
                    discussing: '💬 Agents are discussing...',
                    're-thinking': '🧠 Agents are reconsidering...',
                    clustering: '📊 Analyzing results...',
                };
                ctx!.fillText(phaseLabels[currentPhase] || currentPhase, 16, 30);
                ctx!.restore();
            }

            animFrameRef.current = requestAnimationFrame(gameLoop);
        }

        animFrameRef.current = requestAnimationFrame(gameLoop);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [loaded]);

    // Camera controls
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const cam = cameraRef.current;
        cam.zoom = Math.max(
            CAMERA_CONFIG.MIN_ZOOM,
            Math.min(CAMERA_CONFIG.MAX_ZOOM, cam.zoom - e.deltaY * CAMERA_CONFIG.ZOOM_SENSITIVITY),
        );
    }, []);

    const dragStart = useRef({ x: 0, y: 0 });

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        isDragging.current = true;
        lastMouse.current = { x: e.clientX, y: e.clientY };
        dragStart.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isDragging.current) return;
        const cam = cameraRef.current;
        const dx = e.clientX - lastMouse.current.x;
        const dy = e.clientY - lastMouse.current.y;
        cam.x -= dx / cam.zoom;
        cam.y -= dy / cam.zoom;
        lastMouse.current = { x: e.clientX, y: e.clientY };
    }, []);

    const handleMouseUp = useCallback((e: React.MouseEvent) => {
        isDragging.current = false;

        // Only treat as click if mouse didn't move much (not a drag)
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        if (Math.abs(dx) > 5 || Math.abs(dy) > 5) return;

        // Convert screen coords to world coords
        const canvas = canvasRef.current;
        if (!canvas) return;
        const cam = cameraRef.current;
        const rect = canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const worldX = (screenX - canvas.width / 2) / cam.zoom + cam.x;
        const worldY = (screenY - canvas.height / 2) / cam.zoom + cam.y;

        // Find agent under click (within hit radius)
        const hitRadius = AGENT_CONFIG.WIDTH * 0.6;
        for (const agent of simAgentsRef.current) {
            const adx = agent.x - worldX;
            const ady = agent.y - worldY;
            if (Math.sqrt(adx * adx + ady * ady) < hitRadius) {
                useAgentStore.getState().setSelectedAgentId(agent.id);
                return;
            }
        }
    }, []);

    return (
        <div className="world-canvas-container">
            <canvas
                ref={canvasRef}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
            />
        </div>
    );
}
