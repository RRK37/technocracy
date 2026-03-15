'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { SimAgent } from '@/src/lib/SimAgent';
import { useAgentStore } from '@/src/store/agentStore';
import { WORLD_CONFIG, AGENT_CONFIG, CAMERA_CONFIG, DISCUSSION_CONFIG } from '@/src/lib/world';
import { drawGrid, drawDiscussionCircle } from '@/src/lib/canvas-utils';
import type { CharacterData, CharactersJSON, AgentRuntime, CustomAgent } from '@/src/types/agent';
import { supabase } from '@/src/lib/supabase';

interface WorldCanvasProps {
    onAgentsReady: (agents: SimAgent[]) => void;
}

export default function WorldCanvas({ onAgentsReady }: WorldCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simAgentsRef = useRef<SimAgent[]>([]);
    const animFrameRef = useRef<number>(0);

    // Camera state
    const cameraRef = useRef<{ x: number; y: number; zoom: number }>({ x: WORLD_CONFIG.WIDTH / 2, y: WORLD_CONFIG.HEIGHT / 2, zoom: CAMERA_CONFIG.DEFAULT_ZOOM });
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

                // Load custom agents from Supabase
                let customAgents: CustomAgent[] = [];
                try {
                    const { data: { session } } = await supabase.auth.getSession();
                    if (session) {
                        const caRes = await fetch('/api/agents/custom', {
                            headers: { 'Authorization': `Bearer ${session.access_token}` },
                        });
                        if (caRes.ok) {
                            customAgents = await caRes.json();
                            useAgentStore.getState().setCustomAgents(customAgents);
                        }
                    }
                } catch {
                    // Continue without custom agents
                }

                // Only use characters 1-300 that have a name and persona
                const allKeys = Object.keys(json.characters).filter((key) => {
                    const c = json.characters[key];
                    return c.name && c.persona && c.id >= 1 && c.id <= 300;
                });
                const shuffled = allKeys.sort(() => Math.random() - 0.5);
                // Reserve slots for custom agents
                const numDefaults = Math.max(0, WORLD_CONFIG.NUM_AGENTS - customAgents.length);
                const selected = shuffled.slice(0, numDefaults);

                // Build default agents
                const agents: SimAgent[] = selected.map((key) => {
                    const charData = json.characters[key];
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

                // Build custom agents as SimAgents
                for (const ca of customAgents) {
                    const padded = String(ca.sprite_id).padStart(4, '0');
                    const spriteKey = `character_${padded}`;
                    // Borrow sprite structure from the character data if available, or build minimal
                    const baseChar = json.characters[spriteKey];
                    const customData: CharacterData = {
                        id: ca.sprite_id,
                        gender: baseChar?.gender || 'male',
                        description: ca.persona,
                        name: ca.name,
                        persona: ca.persona,
                        attributes: baseChar?.attributes || {
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
                    const simAgent = new SimAgent(customData, x, y, `custom_${ca.id}`);
                    agents.push(simAgent);
                }

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
            ctx!.fillStyle = '#e0dcd6';
            ctx!.fillRect(0, 0, canvas!.width, canvas!.height);

            // Apply camera transform
            ctx!.save();
            ctx!.translate(canvas!.width / 2, canvas!.height / 2);
            ctx!.scale(cam.zoom, cam.zoom);
            ctx!.translate(-cam.x, -cam.y);

            // Draw grid
            drawGrid(ctx!, WORLD_CONFIG.WIDTH, WORLD_CONFIG.HEIGHT);


            // Draw discussion circles
            const groups = useAgentStore.getState().discussionGroups;
            for (const group of groups) {
                if (!group.completed) {
                    drawDiscussionCircle(ctx!, group.centerX, group.centerY + AGENT_CONFIG.HEIGHT * 0.3, DISCUSSION_CONFIG.CIRCLE_RADIUS);
                }
            }

            // Sort agents by Y for proper layering
            const sorted = [...agents].sort((a, b) => a.y - b.y);
            for (const agent of sorted) {
                agent.draw(ctx!);
            }

            ctx!.restore();


            animFrameRef.current = requestAnimationFrame(gameLoop);
        }

        animFrameRef.current = requestAnimationFrame(gameLoop);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [loaded]);

    // Camera controls
    const clampCamera = useCallback((cam: { x: number; y: number; zoom: number }) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const halfW = canvas.width / 2 / cam.zoom;
        const halfH = canvas.height / 2 / cam.zoom;
        cam.x = Math.max(halfW, Math.min(WORLD_CONFIG.WIDTH - halfW, cam.x));
        cam.y = Math.max(halfH, Math.min(WORLD_CONFIG.HEIGHT - halfH, cam.y));
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const cam = cameraRef.current;
        const canvas = canvasRef.current;
        if (!canvas) return;
        // Compute minimum zoom so viewport doesn't exceed world
        const minZoomW = canvas.width / WORLD_CONFIG.WIDTH;
        const minZoomH = canvas.height / WORLD_CONFIG.HEIGHT;
        const minZoom = Math.max(CAMERA_CONFIG.MIN_ZOOM, minZoomW, minZoomH);
        cam.zoom = Math.max(
            minZoom,
            Math.min(CAMERA_CONFIG.MAX_ZOOM, cam.zoom - e.deltaY * CAMERA_CONFIG.ZOOM_SENSITIVITY),
        );
        clampCamera(cam);
    }, [clampCamera]);

    const dragStart = useRef({ x: 0, y: 0 });
    const lastTouchDistance = useRef<number | null>(null);

    // Touch events — attached via addEventListener to allow passive: false
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onTouchStart = (e: TouchEvent) => {
            e.preventDefault();
            if (e.touches.length === 1) {
                const t = e.touches[0];
                isDragging.current = true;
                lastMouse.current = { x: t.clientX, y: t.clientY };
                dragStart.current = { x: t.clientX, y: t.clientY };
                lastTouchDistance.current = null;
            } else if (e.touches.length === 2) {
                isDragging.current = false;
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDistance.current = Math.hypot(dx, dy);
            }
        };

        const onTouchMove = (e: TouchEvent) => {
            e.preventDefault();
            const cam = cameraRef.current;
            if (e.touches.length === 1 && isDragging.current) {
                const t = e.touches[0];
                const dx = t.clientX - lastMouse.current.x;
                const dy = t.clientY - lastMouse.current.y;
                cam.x -= dx / cam.zoom;
                cam.y -= dy / cam.zoom;
                clampCamera(cam);
                lastMouse.current = { x: t.clientX, y: t.clientY };
            } else if (e.touches.length === 2 && lastTouchDistance.current !== null) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const newDist = Math.hypot(dx, dy);
                const minZoomW = canvas.width / WORLD_CONFIG.WIDTH;
                const minZoomH = canvas.height / WORLD_CONFIG.HEIGHT;
                const minZoom = Math.max(CAMERA_CONFIG.MIN_ZOOM, minZoomW, minZoomH);
                cam.zoom = Math.max(minZoom, Math.min(CAMERA_CONFIG.MAX_ZOOM, cam.zoom * (newDist / lastTouchDistance.current)));
                clampCamera(cam);
                lastTouchDistance.current = newDist;
            }
        };

        const onTouchEnd = (e: TouchEvent) => {
            if (e.touches.length === 0 && isDragging.current) {
                isDragging.current = false;
                const t = e.changedTouches[0];
                const dx = t.clientX - dragStart.current.x;
                const dy = t.clientY - dragStart.current.y;
                // Treat as tap if movement was small
                if (Math.abs(dx) <= 10 && Math.abs(dy) <= 10) {
                    const cam = cameraRef.current;
                    const rect = canvas.getBoundingClientRect();
                    const screenX = t.clientX - rect.left;
                    const screenY = t.clientY - rect.top;
                    const worldX = (screenX - canvas.width / 2) / cam.zoom + cam.x;
                    const worldY = (screenY - canvas.height / 2) / cam.zoom + cam.y;
                    const hitRadius = AGENT_CONFIG.WIDTH * 0.8;
                    for (const agent of simAgentsRef.current) {
                        if (Math.hypot(agent.x - worldX, agent.y - worldY) < hitRadius) {
                            useAgentStore.getState().setSelectedAgentId(agent.id);
                            return;
                        }
                    }
                }
            }
            lastTouchDistance.current = null;
        };

        canvas.addEventListener('touchstart', onTouchStart, { passive: false });
        canvas.addEventListener('touchmove', onTouchMove, { passive: false });
        canvas.addEventListener('touchend', onTouchEnd, { passive: false });
        return () => {
            canvas.removeEventListener('touchstart', onTouchStart);
            canvas.removeEventListener('touchmove', onTouchMove);
            canvas.removeEventListener('touchend', onTouchEnd);
        };
    }, [clampCamera]);

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
        clampCamera(cam);
        lastMouse.current = { x: e.clientX, y: e.clientY };
    }, [clampCamera]);

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
