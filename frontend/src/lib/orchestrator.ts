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

// ── Queue helpers ──────────────────────────────────────────────────

/** Check if there are pending messages from the user */
function hasPending(): boolean {
    return useAgentStore.getState().pendingMessages.length > 0;
}

/** Drain pending messages, return combined text */
function consumePending(): string {
    const store = useAgentStore.getState();
    const msgs = store.drainPending();
    return msgs.join('\n');
}

/** Run a think cycle for all agents with current context */
async function runThinkCycle(
    simAgents: SimAgent[],
    question: string,
    extraContext?: string,
): Promise<void> {
    const store = useAgentStore.getState();

    const thinkingSample = [...simAgents]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(8, simAgents.length));

    const BATCH_SIZE = 20;

    const processAgent = async (agent: SimAgent) => {
        const runtime = useAgentStore.getState().agents.find((a: { id: string }) => a.id === agent.id);
        if (!runtime) return;

        try {
            const traceForCall = extraContext
                ? [...runtime.trace, extraContext]
                : runtime.trace;

            const result = await callThink(
                agentName(agent),
                agent.data.persona,
                traceForCall,
                question,
            );

            const freshRuntime = useAgentStore.getState().agents.find((a: { id: string }) => a.id === agent.id);
            const currentTrace = freshRuntime?.trace || runtime.trace;

            const traceEntry = extraContext
                ? `[Follow-up] ${result.reasoning}`
                : result.reasoning;

            store.updateAgent(agent.id, {
                trace: [...currentTrace, traceEntry],
                answer: result.answer,
            });

            if (thinkingSample.includes(agent)) {
                agent.showThought(result.answer.slice(0, 80) + (result.answer.length > 80 ? '...' : ''), 6000);
            }
        } catch (err) {
            console.error(`Think failed for ${agent.id}:`, err);
        }
    };

    // Process in batches of 20
    for (let i = 0; i < simAgents.length; i += BATCH_SIZE) {
        const batch = simAgents.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(processAgent));
    }
}

/** Run final clustering and save to history */
async function finalCluster(
    simAgents: SimAgent[],
    question: string,
    clusterInterval: ReturnType<typeof setInterval>,
    saveHistory: boolean,
): Promise<void> {
    clearInterval(clusterInterval);
    const store = useAgentStore.getState();
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

    store.setPhase('complete');

    // Save to history only on the first question
    if (saveHistory) {
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
}

/** Start background clustering interval (every 5s) */
function startBackgroundClustering(question: string): ReturnType<typeof setInterval> {
    return setInterval(async () => {
        const currentAgents = useAgentStore.getState().agents;
        const currentAnswers = currentAgents
            .filter((a: { answer: string }) => a.answer)
            .map((a: { id: string; answer: string }) => ({ agentId: a.id, answer: a.answer }));
        if (currentAnswers.length < 2) return;
        try {
            const { themes } = await callCluster(currentAnswers, question);
            const phase = useAgentStore.getState().phase;
            if (phase !== 'clustering' && phase !== 'complete') {
                useAgentStore.getState().setClusteredResults(themes);
            }
        } catch (_) { /* ignore interim failures */ }
    }, 5000);
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

    // ── Recall user memories ──
    let memoryContext: string | undefined;
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
            const res = await fetch('/api/memories/recall', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, accessToken: session.access_token }),
            });
            if (res.ok) {
                const { memories } = await res.json();
                if (memories && memories.length > 0) {
                    memoryContext = `Things known about the person asking:\n${memories.map((m: string) => `- ${m}`).join('\n')}`;
                }
            }
        }
    } catch (err) {
        console.error('Memory recall failed:', err);
    }

    const clusterInterval = startBackgroundClustering(question);

    // ── Phase 1: Initial Think ──
    await runThinkCycle(simAgents, question, memoryContext);

    // ── Check queue after Phase 1 ──
    if (hasPending()) {
        const followUp = consumePending();
        store.setPhase('thinking');
        await runThinkCycle(simAgents, question, `--- User follow-up ---\n${followUp}`);
        // Skip discussion, go directly to final cluster
        await finalCluster(simAgents, question, clusterInterval, true);
        // Check if more messages arrived during clustering
        if (hasPending()) {
            await processFollowUps(simAgents, question);
        }
        return;
    }

    // ── Phase 2: Form Discussion Groups ──
    store.setPhase('discussing');

    const groups = findNearbyGroups(simAgents);
    store.setDiscussionGroups([]);

    // Process each group in parallel, but staggered by 2 seconds
    const groupPromises = groups.map(async (group, index) => {
        // Stagger starts
        await new Promise((r) => setTimeout(r, index * 2000));

        // Add this group to the active canvas
        useAgentStore.setState((s) => ({ discussionGroups: [...s.discussionGroups, group] }));

        // Agents walk to circle
        arrangeInCircle(simAgents, group);
        await new Promise((r) => setTimeout(r, 3000));

        // ── Phase 2b: Sequential discussion within this group ──
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

                const entry = `${agentName(speaker)}: ${result.message}`;
                group.conversationLog.push(entry);
                conversationSoFar += entry + '\n\n';

                await new Promise((r) => setTimeout(r, DISCUSSION_CONFIG.SPEECH_DELAY_MS));
            } catch (err) {
                console.error(`Discuss failed for ${speaker.id}:`, err);
            }
        }

        // Save conversation trace to all members
        for (const member of memberAgents) {
            const runtime = useAgentStore.getState().agents.find((a: { id: string }) => a.id === member.id);
            if (!runtime) continue;
            store.updateAgent(member.id, {
                trace: [...runtime.trace, `--- Group Discussion ---\n${conversationSoFar}`],
            });
        }

        group.completed = true;
        // Trigger a re-render of groups by mutating state slightly or cloning array
        useAgentStore.setState((s) => ({ discussionGroups: [...s.discussionGroups] }));
    });

    await Promise.all(groupPromises);

    // ── Check queue after Phase 2 ──
    if (hasPending()) {
        const followUp = consumePending();
        for (const agent of simAgents) agent.resetToWandering();
        store.setPhase('thinking');
        await runThinkCycle(simAgents, question, `--- User follow-up ---\n${followUp}`);
        await finalCluster(simAgents, question, clusterInterval, true);
        if (hasPending()) await processFollowUps(simAgents, question);
        return;
    }

    // ── Phase 3: Re-think ──
    store.setPhase('re-thinking');

    for (const agent of simAgents) {
        agent.resetToWandering();
    }

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

    // ── Phase 4: Final cluster + save ──
    await finalCluster(simAgents, question, clusterInterval, true);

    // ── Check queue after completion ──
    if (hasPending()) {
        await processFollowUps(simAgents, question);
    }
}

/**
 * Process follow-up messages: drain queue → re-think → re-cluster.
 * Called from Sidebar when session is idle, or from phase boundary checks.
 * Loops until the queue is empty.
 */
export async function processFollowUps(
    simAgents: SimAgent[],
    question?: string,
): Promise<void> {
    const store = useAgentStore.getState();
    const q = question || store.question;

    while (hasPending()) {
        const followUp = consumePending();
        store.setPhase('thinking');

        // Build conversation context
        const allMessages = useAgentStore.getState().messages;
        const conversationContext = allMessages
            .map((m) => `${m.role === 'user' ? 'User' : 'System'}: ${m.text}`)
            .join('\n');

        await runThinkCycle(simAgents, q, `--- Conversation ---\n${conversationContext}`);

        // Quick cluster
        store.setPhase('clustering');
        const latestAgents = useAgentStore.getState().agents;
        const answers = latestAgents
            .filter((a: { answer: string }) => a.answer)
            .map((a: { id: string; answer: string }) => ({ agentId: a.id, answer: a.answer }));

        try {
            const { themes } = await callCluster(answers, q);
            store.setClusteredResults(themes);
        } catch (err) {
            console.error('Re-clustering failed:', err);
        }

        store.setPhase('complete');
    }
}
