/**
 * Orchestrator – drives the question → think → discuss → re-think → cluster flow
 * All LLM calls go through Next.js API routes (server-side, API key protected)
 */

import { supabase } from './supabase';
import { useAgentStore } from '@/src/store/agentStore';
import type { SimAgent } from './SimAgent';
import { DISCUSSION_CONFIG } from './world';
import type { ThemeCluster, DiscussionGroup } from '@/src/types/agent';

// ── Helpers ────────────────────────────────────────────────────────

/** Always returns a usable display name for an agent */
function agentName(agent: SimAgent): string {
    return agent.data.name || `Agent ${agent.id.replace('character_', '#')}`;
}

// ── API callers (Next.js API routes) ───────────────────────────────

async function callThink(
    agentName: string,
    persona: string,
    trace: string[],
    question: string,
): Promise<{ reasoning: string; answer: string }> {
    const res = await fetch('/api/think', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: agentName, persona, trace, question }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Think API failed: ${res.status}`);
    }
    return res.json();
}

async function callDiscuss(
    participants: { name: string; persona: string }[],
    question: string,
    conversationSoFar: string,
    currentSpeaker: { name: string; persona: string; trace: string[] },
): Promise<{ speaker: string; message: string }> {
    const res = await fetch('/api/discuss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ participants, question, conversationSoFar, currentSpeaker }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Discuss API failed: ${res.status}`);
    }
    return res.json();
}

async function callCluster(
    answers: { agentId: string; answer: string }[],
    question: string,
): Promise<{ themes: ThemeCluster[] }> {
    const res = await fetch('/api/cluster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, question }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `Cluster API failed: ${res.status}`);
    }
    return res.json();
}

// ── Helpers ────────────────────────────────────────────────────────

/** Find groups of nearby agents (2-6 per group) */
export function findNearbyGroups(simAgents: SimAgent[]): DiscussionGroup[] {
    const used = new Set<string>();
    const groups: DiscussionGroup[] = [];

    // Shuffle agents for randomness
    const shuffled = [...simAgents].sort(() => Math.random() - 0.5);

    for (const agent of shuffled) {
        if (used.has(agent.id)) continue;

        // Find nearby agents not yet used
        const nearby = shuffled.filter(
            (other) =>
                other.id !== agent.id &&
                !used.has(other.id) &&
                Math.hypot(other.x - agent.x, other.y - agent.y) < DISCUSSION_CONFIG.PROXIMITY_THRESHOLD,
        );

        if (nearby.length === 0) continue;

        // Take a random subset (1-5 neighbors + self = 2-6 total)
        const groupSize = Math.min(
            DISCUSSION_CONFIG.MIN_GROUP_SIZE +
            Math.floor(Math.random() * (DISCUSSION_CONFIG.MAX_GROUP_SIZE - DISCUSSION_CONFIG.MIN_GROUP_SIZE)),
            nearby.length + 1,
        );

        const members = [agent, ...nearby.slice(0, groupSize - 1)];
        for (const m of members) used.add(m.id);

        // Calculate center
        const cx = members.reduce((s, m) => s + m.x, 0) / members.length;
        const cy = members.reduce((s, m) => s + m.y, 0) / members.length;

        groups.push({
            agentIds: members.map((m) => m.id),
            centerX: cx,
            centerY: cy,
            conversationLog: [],
            currentSpeakerIndex: 0,
            completed: false,
        });
    }

    return groups;
}

/** Position agents in a circle around a center point */
export function arrangeInCircle(
    simAgents: SimAgent[],
    group: DiscussionGroup,
): void {
    const members = simAgents.filter((a) => group.agentIds.includes(a.id));
    const n = members.length;

    for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
        const tx = group.centerX + Math.cos(angle) * DISCUSSION_CONFIG.CIRCLE_RADIUS;
        const ty = group.centerY + Math.sin(angle) * DISCUSSION_CONFIG.CIRCLE_RADIUS;
        members[i].walkToDiscussion(tx, ty, group.centerX, group.centerY);
    }
}

// ── Main orchestration ─────────────────────────────────────────────

export async function runDeliberation(
    simAgents: SimAgent[],
    question: string,
): Promise<void> {
    const store = useAgentStore.getState();
    store.setQuestion(question);
    store.setPhase('thinking');
    store.setClusteredResults([]);

    // ── Phase 1: Initial Think ──
    const thinkingSample = [...simAgents]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(8, simAgents.length));

    // Fire all think calls in parallel
    const thinkPromises = simAgents.map(async (agent) => {
        const runtime = store.agents.find((a: { id: string }) => a.id === agent.id);
        if (!runtime) return;

        try {
            const result = await callThink(
                agentName(agent),
                agent.data.persona,
                runtime.trace,
                question,
            );

            // Update store
            const freshRuntime = useAgentStore.getState().agents.find((a: { id: string }) => a.id === agent.id);
            const currentTrace = freshRuntime?.trace || runtime.trace;
            store.updateAgent(agent.id, {
                trace: [...currentTrace, result.reasoning],
                answer: result.answer,
            });

            // Show thought bubble on sampled agents
            if (thinkingSample.includes(agent)) {
                agent.showThought(result.answer.slice(0, 80) + (result.answer.length > 80 ? '...' : ''), 6000);
            }
        } catch (err) {
            console.error(`Think failed for ${agent.id}:`, err);
        }
    });

    await Promise.all(thinkPromises);

    // ── Phase 2: Form Discussion Groups ──
    store.setPhase('discussing');

    const groups = findNearbyGroups(simAgents);
    store.setDiscussionGroups(groups);

    // Arrange agents into circles
    for (const group of groups) {
        arrangeInCircle(simAgents, group);
    }

    // Wait for agents to walk to positions
    await new Promise((r) => setTimeout(r, 3000));

    // ── Phase 2b: Sequential discussion in each group ──
    for (const group of groups) {
        const memberAgents = simAgents.filter((a) => group.agentIds.includes(a.id));
        const participants = memberAgents.map((a) => ({
            name: agentName(a),
            persona: a.data.persona,
        }));

        let conversationSoFar = '';
        const speakOrder = [...memberAgents].sort(() => Math.random() - 0.5);

        for (const speaker of speakOrder) {
            const runtime = useAgentStore.getState().agents.find((a: { id: string }) => a.id === speaker.id);
            if (!runtime) continue;

            try {
                const result = await callDiscuss(
                    participants,
                    question,
                    conversationSoFar,
                    { name: agentName(speaker), persona: speaker.data.persona, trace: runtime.trace },
                );

                speaker.showSpeech(
                    `${result.message.slice(0, 100)}${result.message.length > 100 ? '...' : ''}`,
                    4000,
                );

                // Use our known speaker name, not the LLM-returned one
                const entry = `${agentName(speaker)}: ${result.message}`;
                group.conversationLog.push(entry);
                conversationSoFar += entry + '\n\n';

                await new Promise((r) => setTimeout(r, DISCUSSION_CONFIG.SPEECH_DELAY_MS));
            } catch (err) {
                console.error(`Discuss failed for ${speaker.id}:`, err);
            }
        }

        // Append conversation to each member's trace
        for (const member of memberAgents) {
            const runtime = useAgentStore.getState().agents.find((a: { id: string }) => a.id === member.id);
            if (!runtime) continue;
            store.updateAgent(member.id, {
                trace: [...runtime.trace, `--- Group Discussion ---\n${conversationSoFar}`],
            });
        }

        group.completed = true;
    }

    // ── Phase 3: Re-think ──
    store.setPhase('re-thinking');

    for (const agent of simAgents) {
        agent.resetToWandering();
    }

    // Only re-think agents who participated in a discussion
    const discussedAgentIds = new Set(groups.flatMap((g) => g.agentIds));
    const discussedAgents = simAgents.filter((a) => discussedAgentIds.has(a.id));

    const rethinkPromises = discussedAgents.map(async (agent) => {
        const runtime = useAgentStore.getState().agents.find((a: { id: string }) => a.id === agent.id);
        if (!runtime) return;

        try {
            const result = await callThink(
                agentName(agent),
                agent.data.persona,
                runtime.trace,
                question,
            );

            store.updateAgent(agent.id, {
                trace: [...runtime.trace, result.reasoning],
                answer: result.answer,
            });
        } catch (err) {
            console.error(`Re-think failed for ${agent.id}:`, err);
        }
    });

    await Promise.all(rethinkPromises);

    // ── Phase 4: Cluster answers ──
    store.setPhase('clustering');

    const latestAgents = useAgentStore.getState().agents;
    const answers = latestAgents
        .filter((a: { answer: string }) => a.answer)
        .map((a: { id: string; answer: string }) => ({ agentId: a.id, answer: a.answer }));

    try {
        const { themes } = await callCluster(answers, question);
        store.setClusteredResults(themes);
    } catch (err) {
        console.error('Clustering failed:', err);
    }

    // ── Phase 5: Save to history ──
    store.setPhase('complete');

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const latestResults = useAgentStore.getState().clusteredResults;
            const { data, error } = await supabase
                .from('question_history')
                .insert({
                    user_id: user.id,
                    question,
                    clustered_results: {
                        themes: latestResults,
                        total_agents: simAgents.length,
                    },
                })
                .select()
                .single();

            if (data && !error) {
                store.addHistory(data);
            }
        }
    } catch (err) {
        console.error('History save failed:', err);
    }
}
