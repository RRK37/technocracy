'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { SimAgent } from '@/src/lib/SimAgent';
import { useAgentStore } from '@/src/store/agentStore';
import { WORLD_CONFIG, AGENT_CONFIG, CAMERA_CONFIG, DISCUSSION_CONFIG } from '@/src/lib/world';
import { drawGrid, drawDiscussionCircle, drawInfluenceArc } from '@/src/lib/canvas-utils';
import type { CharacterData, CharactersJSON, AgentRuntime, CustomAgent } from '@/src/types/agent';
import { supabase } from '@/src/lib/supabase';

// Fallback palette used if the embedding API call fails
const FALLBACK_COLORS = [
    '#e74c3c', '#3498db', '#2ecc71', '#f39c12',
    '#9b59b6', '#1abc9c', '#e91e63', '#00bcd4',
];

const ARC_FADE_MS = 30_000;

/** Spread N cluster centroids evenly across the world */
function computeClusterCentroids(n: number): { x: number; y: number }[] {
    const mx = 300, my = 250;
    const uw = WORLD_CONFIG.WIDTH - mx * 2;
    const uh = WORLD_CONFIG.HEIGHT - my * 2;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * (uw / uh))));
    const rows = Math.max(1, Math.ceil(n / cols));
    return Array.from({ length: n }, (_, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
            x: mx + (cols > 1 ? (col / (cols - 1)) * uw : uw / 2),
            y: my + (rows > 1 ? (row / (rows - 1)) * uh : uh / 2),
        };
    });
}

interface InfluenceArc {
    agentIds: string[];
    completedAt: number;
}

interface WorldCanvasProps {
    onAgentsReady: (agents: SimAgent[]) => void;
}

export default function WorldCanvas({ onAgentsReady }: WorldCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const simAgentsRef = useRef<SimAgent[]>([]);
    const animFrameRef = useRef<number>(0);

    // Influence arcs (feature 2)
    const influenceArcsRef = useRef<InfluenceArc[]>([]);
    const prevGroupKeysRef = useRef<Set<string>>(new Set());

    // Persistent label→color map (populated from embedding API)
    const clusterColorMapRef = useRef<Map<string, string>>(new Map());
    // Track last fetched label set so we don't re-call if labels haven't changed
    const lastLabelKeyRef = useRef<string>('');

    // Camera state
    const cameraRef = useRef<{ x: number; y: number; zoom: number }>({ x: WORLD_CONFIG.WIDTH / 2, y: WORLD_CONFIG.HEIGHT / 2, zoom: CAMERA_CONFIG.DEFAULT_ZOOM });
    const isDragging = useRef(false);
    const lastMouse = useRef({ x: 0, y: 0 });

    const { phase, discussionGroups, clusteredResults, generation } = useAgentStore();
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
                    return c.name && c.persona && c.id >= 200 && c.id <= 299;
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

    // Reset visual state on session reset (feature 1, 2, 4)
    useEffect(() => {
        simAgentsRef.current.forEach(a => {
            a.setCluster(null);
            a.setDriftTarget(null, null);
        });
        influenceArcsRef.current = [];
        prevGroupKeysRef.current.clear();
        clusterColorMapRef.current.clear();
        lastLabelKeyRef.current = '';
    }, [generation]);

    // Propagate cluster colors + drift targets when results arrive (feature 1, 4)
    useEffect(() => {
        if (clusteredResults.length === 0) {
            simAgentsRef.current.forEach(a => {
                a.setCluster(null);
                a.setDriftTarget(null, null);
            });
            return;
        }

        // Assign drift targets immediately (don't wait for color fetch)
        const centroids = computeClusterCentroids(clusteredResults.length);
        clusteredResults.forEach((cluster, i) => {
            cluster.agentIds.forEach(id => {
                const agent = simAgentsRef.current.find(a => a.id === id);
                if (agent) agent.setDriftTarget(centroids[i].x, centroids[i].y);
            });
        });

        // Re-apply cached colors for agents whose label we already know
        const colorMap = clusterColorMapRef.current;
        clusteredResults.forEach(cluster => {
            const color = colorMap.get(cluster.label);
            if (color) {
                cluster.agentIds.forEach(id => {
                    const agent = simAgentsRef.current.find(a => a.id === id);
                    if (agent) agent.setCluster(color);
                });
            }
        });

        // Only fetch embeddings when the label set actually changes
        const labels = clusteredResults.map(c => c.label);
        const labelKey = [...labels].sort().join('||');
        if (labelKey === lastLabelKeyRef.current) return;
        lastLabelKeyRef.current = labelKey;

        fetch('/api/cluster-colors', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ labels }),
        })
            .then(r => r.json())
            .then(({ colors }: { colors: Record<string, string> }) => {
                // Discard if the cluster set changed while we were waiting
                if (lastLabelKeyRef.current !== labelKey) return;
                Object.entries(colors).forEach(([label, color]) => colorMap.set(label, color));
                useAgentStore.getState().setClusterColors(Object.fromEntries(colorMap));
                // Apply to agents
                clusteredResults.forEach(cluster => {
                    const color = colorMap.get(cluster.label);
                    if (color) {
                        cluster.agentIds.forEach(id => {
                            const agent = simAgentsRef.current.find(a => a.id === id);
                            if (agent) agent.setCluster(color);
                        });
                    }
                });
            })
            .catch(() => {
                // Fallback to palette on error
                clusteredResults.forEach((cluster, i) => {
                    if (!colorMap.has(cluster.label)) {
                        colorMap.set(cluster.label, FALLBACK_COLORS[i % FALLBACK_COLORS.length]);
                    }
                    const color = colorMap.get(cluster.label)!;
                    cluster.agentIds.forEach(id => {
                        const agent = simAgentsRef.current.find(a => a.id === id);
                        if (agent) agent.setCluster(color);
                    });
                });
                useAgentStore.getState().setClusterColors(Object.fromEntries(colorMap));
            });
    }, [clusteredResults]);

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

            // Detect newly completed discussion groups → record influence arcs (feature 2)
            const now = Date.now();
            const groups = useAgentStore.getState().discussionGroups;
            for (const group of groups) {
                if (!group.completed) continue;
                const key = [...group.agentIds].sort().join('|');
                if (!prevGroupKeysRef.current.has(key)) {
                    prevGroupKeysRef.current.add(key);
                    if (group.agentIds.length >= 2) {
                        influenceArcsRef.current.push({ agentIds: group.agentIds, completedAt: now });
                    }
                }
            }

            // Expire and draw influence arcs (feature 2)
            influenceArcsRef.current = influenceArcsRef.current.filter(arc => now - arc.completedAt < ARC_FADE_MS);
            for (const arc of influenceArcsRef.current) {
                const alpha = (1 - (now - arc.completedAt) / ARC_FADE_MS) * 0.35;
                const members = arc.agentIds
                    .map(id => agents.find(a => a.id === id))
                    .filter((a): a is SimAgent => a !== undefined);
                for (let i = 0; i < members.length; i++) {
                    for (let j = i + 1; j < members.length; j++) {
                        drawInfluenceArc(ctx!, members[i].x, members[i].y, members[j].x, members[j].y, alpha);
                    }
                }
            }

            // Draw discussion circles
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
