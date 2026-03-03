/**
 * Orchestrator – drives the question → think → discuss → re-think → cluster flow
 * All LLM calls go through Next.js API routes (server-side, API key protected)
 */

import { supabase } from './supabase';
import { useAgentStore } from '@/src/store/agentStore';
import type { SimAgent } from './SimAgent';
import { DISCUSSION_CONFIG } from './world';
import type { ThemeCluster, DiscussionGroup } from '@/src/types/agent';

// ── Abort helpers ─────────────────────────────────────────────────

/** Returns true if the session has been reset since this generation started */
function isAborted(gen: number): boolean {
    return useAgentStore.getState().generation !== gen;
}

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

    const BATCH_SIZE = 10;

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

    // Process in batches with inter-batch delay
    for (let i = 0; i < simAgents.length; i += BATCH_SIZE) {
        if (i > 0) await new Promise(r => setTimeout(r, 1500));
        const batch = simAgents.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(processAgent));
    }
}

/** Process a single agent's think call */
async function processAgentThink(
    agent: SimAgent,
    question: string,
    extraContext: string | undefined,
    thinkingSample: SimAgent[],
    gen?: number,
): Promise<void> {
    const store = useAgentStore.getState();
    if (gen !== undefined && isAborted(gen)) return;
    const runtime = store.agents.find((a: { id: string }) => a.id === agent.id);
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

        if (gen !== undefined && isAborted(gen)) return;

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
}

/** Run a single group's discussion (sequential speakers, save traces) */
async function runGroupDiscussion(
    group: DiscussionGroup,
    simAgents: SimAgent[],
    question: string,
    gen?: number,
): Promise<void> {
    const store = useAgentStore.getState();
    const memberAgents = simAgents.filter((a) => group.agentIds.includes(a.id));
    const participants = memberAgents.map((a) => ({
        name: agentName(a),
        persona: a.data.persona,
    }));

    let conversationSoFar = '';
    const speakOrder = [...memberAgents].sort(() => Math.random() - 0.5);

    for (const speaker of speakOrder) {
        if (gen !== undefined && isAborted(gen)) return;
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
    useAgentStore.setState((s) => ({ discussionGroups: [...s.discussionGroups] }));
}

/** Re-think for a single agent after discussion */
async function processAgentRethink(
    agent: SimAgent,
    question: string,
): Promise<void> {
    const store = useAgentStore.getState();
    const runtime = store.agents.find((a: { id: string }) => a.id === agent.id);
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
}

/** Consumer loop: polls ready pool, forms groups, runs discussions, re-thinks */
async function runDiscussionConsumer(
    readyPool: Set<SimAgent>,
    allSimAgents: SimAgent[],
    question: string,
    thinkingDone: { value: boolean },
    gen?: number,
): Promise<void> {
    const store = useAgentStore.getState();
    let phaseAdvanced = false;

    while (true) {
        if (gen !== undefined && isAborted(gen)) return;
        const readyAgents = Array.from(readyPool);
        const groups = findNearbyGroups(readyAgents);

        if (groups.length > 0) {
            if (!phaseAdvanced) {
                store.setPhase('discussing');
                phaseAdvanced = true;
            }

            // Remove grouped agents from pool
            for (const g of groups) {
                for (const id of g.agentIds) {
                    const agent = readyAgents.find(a => a.id === id);
                    if (agent) readyPool.delete(agent);
                }
            }

            // Run all found groups in parallel (staggered)
            const groupPromises = groups.map(async (group, index) => {
                await new Promise(r => setTimeout(r, index * 2000));
                useAgentStore.setState(s => ({
                    discussionGroups: [...s.discussionGroups, group]
                }));
                arrangeInCircle(allSimAgents, group);
                await new Promise(r => setTimeout(r, 3000));
                await runGroupDiscussion(group, allSimAgents, question, gen);

                // Re-think for agents in this group
                const memberAgents = allSimAgents.filter(a => group.agentIds.includes(a.id));
                await Promise.all(memberAgents.map(agent => processAgentRethink(agent, question)));
                for (const agent of memberAgents) agent.resetToWandering();
            });

            await Promise.all(groupPromises);
        }

        // Exit: thinking done AND either pool is empty or no more groups can form
        if (thinkingDone.value && (readyPool.size === 0 || groups.length === 0)) break;

        // Poll interval
        await new Promise(r => setTimeout(r, 1500));
    }
}

/** Run final clustering and save to history */
async function finalCluster(
    simAgents: SimAgent[],
    question: string,
    clusterInterval: ReturnType<typeof setInterval>,
    saveHistory: boolean,
    gen?: number,
): Promise<void> {
    clearInterval(clusterInterval);
    if (gen !== undefined && isAborted(gen)) return;
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

/** Save current results to history and reset session */
export async function saveAndReset(simAgents: SimAgent[]): Promise<void> {
    const store = useAgentStore.getState();
    const question = store.question;
    const clusteredResults = store.clusteredResults;

    // Save to history if there are results
    if (question && clusteredResults.length > 0) {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data, error } = await supabase
                    .from('question_history')
                    .insert({
                        user_id: user.id,
                        question,
                        clustered_results: {
                            themes: clusteredResults,
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
            console.error('History save on reset failed:', err);
        }
    }

    // Reset aborts all in-flight work via generation increment
    store.resetSession();
}

/** Start background clustering interval (every 4s) */
function startBackgroundClustering(question: string, gen?: number): ReturnType<typeof setInterval> {
    return setInterval(async () => {
        if (gen !== undefined && isAborted(gen)) return;
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
    }, 4000);
}

// ── Main orchestration ─────────────────────────────────────────────

export async function runDeliberation(
    simAgents: SimAgent[],
    question: string,
): Promise<void> {
    const store = useAgentStore.getState();
    const gen = store.generation;
    store.setQuestion(question);
    store.setPhase('thinking');
    store.setClusteredResults([]);

    // Track usage
    const currentMonth = new Date().toISOString().slice(0, 7);
    supabase.rpc('increment_usage', {
        p_month: currentMonth,
        p_questions: 1,
    }).then(({ error }) => { if (error) console.error('Usage track error:', error); });

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

    const clusterInterval = startBackgroundClustering(question, gen);

    // ── Phase 1+2: Concurrent think (producer) + discuss (consumer) ──
    const readyPool = new Set<SimAgent>();
    const thinkingDone = { value: false };
    store.setPhase('thinking');
    store.setDiscussionGroups([]);

    const thinkingSample = [...simAgents]
        .sort(() => Math.random() - 0.5)
        .slice(0, Math.min(8, simAgents.length));

    // Producer: fire think calls in batches, add to readyPool on completion
    const BATCH_SIZE = 10;
    const thinkProducer = (async () => {
        for (let i = 0; i < simAgents.length; i += BATCH_SIZE) {
            if (isAborted(gen)) return;
            if (i > 0) await new Promise(r => setTimeout(r, 1500));
            const batch = simAgents.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (agent) => {
                await processAgentThink(agent, question, memoryContext, thinkingSample, gen);
                if (!isAborted(gen)) readyPool.add(agent);
            }));
        }
        thinkingDone.value = true;
    })();

    // Consumer: poll ready pool, form groups, discuss, re-think
    const discussConsumer = runDiscussionConsumer(
        readyPool, simAgents, question, thinkingDone, gen
    );

    // Wait for both to finish
    await Promise.all([thinkProducer, discussConsumer]);
    if (isAborted(gen)) { clearInterval(clusterInterval); return; }

    // ── Check queue before final cluster ──
    if (hasPending()) {
        const followUp = consumePending();
        store.setPhase('thinking');
        await runThinkCycle(simAgents, question, `--- User follow-up ---\n${followUp}`);
        await finalCluster(simAgents, question, clusterInterval, true, gen);
        if (!isAborted(gen) && hasPending()) await processFollowUps(simAgents, question);
        return;
    }

    // ── Phase 3: Final cluster + save ──
    await finalCluster(simAgents, question, clusterInterval, true, gen);

    // ── Check queue after completion ──
    if (!isAborted(gen) && hasPending()) {
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
    const gen = store.generation;
    const q = question || store.question;

    while (hasPending()) {
        if (isAborted(gen)) return;
        consumePending();

        // Track follow-up usage
        const currentMonth = new Date().toISOString().slice(0, 7);
        supabase.rpc('increment_usage', {
            p_month: currentMonth,
            p_questions: 0.25,
        }).then(({ error }) => { if (error) console.error('Usage track error:', error); });

        // Build conversation context
        const allMessages = useAgentStore.getState().messages;
        const conversationContext = allMessages
            .map((m) => `${m.role === 'user' ? 'User' : 'System'}: ${m.text}`)
            .join('\n');
        const extraContext = `--- Conversation ---\n${conversationContext}`;

        const clusterInterval = startBackgroundClustering(q, gen);

        // ── Think + Discuss (mirrors initial deliberation) ──
        const readyPool = new Set<SimAgent>();
        const thinkingDone = { value: false };
        store.setPhase('thinking');
        store.setDiscussionGroups([]);

        const thinkingSample = [...simAgents]
            .sort(() => Math.random() - 0.5)
            .slice(0, Math.min(8, simAgents.length));

        const BATCH_SIZE = 10;
        const thinkProducer = (async () => {
            for (let i = 0; i < simAgents.length; i += BATCH_SIZE) {
                if (isAborted(gen)) return;
                if (i > 0) await new Promise(r => setTimeout(r, 1500));
                const batch = simAgents.slice(i, i + BATCH_SIZE);
                await Promise.all(batch.map(async (agent) => {
                    await processAgentThink(agent, q, extraContext, thinkingSample, gen);
                    if (!isAborted(gen)) readyPool.add(agent);
                }));
            }
            thinkingDone.value = true;
        })();

        const discussConsumer = runDiscussionConsumer(
            readyPool, simAgents, q, thinkingDone, gen
        );

        await Promise.all([thinkProducer, discussConsumer]);
        if (isAborted(gen)) { clearInterval(clusterInterval); return; }

        // ── Final cluster ──
        await finalCluster(simAgents, q, clusterInterval, false, gen);
    }
}
