/**
 * Zustand store – global agent state, question flow, results
 */

import { create } from 'zustand';
import type { AgentRuntime, ThemeCluster, DiscussionGroup, QuestionHistory, CustomAgent } from '@/src/types/agent';

export type Phase = 'idle' | 'thinking' | 'discussing' | 're-thinking' | 'clustering' | 'complete';

export interface ConversationMessage {
    role: 'user' | 'system';
    text: string;
}

interface AgentStore {
    // Agents
    agents: AgentRuntime[];
    setAgents: (agents: AgentRuntime[]) => void;
    updateAgent: (id: string, patch: Partial<AgentRuntime>) => void;

    // Question (first question only, used for history)
    question: string;
    setQuestion: (q: string) => void;

    // Conversation thread (all messages in current session)
    messages: ConversationMessage[];
    addMessage: (msg: ConversationMessage) => void;
    clearMessages: () => void;

    // Phase
    phase: Phase;
    setPhase: (p: Phase) => void;

    // Results
    clusteredResults: ThemeCluster[];
    setClusteredResults: (r: ThemeCluster[]) => void;

    // Discussion groups
    discussionGroups: DiscussionGroup[];
    setDiscussionGroups: (g: DiscussionGroup[]) => void;

    // History
    history: QuestionHistory[];
    setHistory: (h: QuestionHistory[]) => void;
    addHistory: (h: QuestionHistory) => void;

    // Custom agents
    customAgents: CustomAgent[];
    setCustomAgents: (agents: CustomAgent[]) => void;
    addCustomAgent: (agent: CustomAgent) => void;
    removeCustomAgent: (id: string) => void;

    // Selected agent (for detail modal)
    selectedAgentId: string | null;
    setSelectedAgentId: (id: string | null) => void;

    // Sidebar tab
    sidebarTab: 'results' | 'agents' | 'history';
    setSidebarTab: (tab: 'results' | 'agents' | 'history') => void;

    // Pending message queue (messages sent while busy)
    pendingMessages: string[];
    queueMessage: (msg: string) => void;
    drainPending: () => string[];

    // Session generation (incremented on reset to abort in-flight work)
    generation: number;

    // Session management
    resetSession: () => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
    agents: [],
    setAgents: (agents) => {
        const seen = new Set<string>();
        const unique = agents.filter(a => {
            if (seen.has(a.id)) return false;
            seen.add(a.id);
            return true;
        });
        set({ agents: unique });
    },
    updateAgent: (id, patch) =>
        set((s) => ({
            agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),

    question: '',
    setQuestion: (question) => set({ question }),

    messages: [],
    addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
    clearMessages: () => set({ messages: [] }),

    phase: 'idle',
    setPhase: (phase) => set({ phase }),

    clusteredResults: [],
    setClusteredResults: (clusteredResults) => set({ clusteredResults }),

    discussionGroups: [],
    setDiscussionGroups: (discussionGroups) => set({ discussionGroups }),

    history: [],
    setHistory: (history) => set({ history }),
    addHistory: (h) => set((s) => ({ history: [h, ...s.history] })),

    customAgents: [],
    setCustomAgents: (customAgents) => set({ customAgents }),
    addCustomAgent: (agent) => set((s) => ({ customAgents: [...s.customAgents, agent] })),
    removeCustomAgent: (id) => set((s) => ({ customAgents: s.customAgents.filter((a) => a.id !== id) })),

    selectedAgentId: null,
    setSelectedAgentId: (selectedAgentId) => set({ selectedAgentId }),

    sidebarTab: 'results',
    setSidebarTab: (sidebarTab) => set({ sidebarTab }),

    pendingMessages: [],
    queueMessage: (msg) => set((s) => ({ pendingMessages: [...s.pendingMessages, msg] })),
    drainPending: (): string[] => {
        let msgs: string[] = [];
        set((s) => {
            msgs = s.pendingMessages;
            return { pendingMessages: [] };
        });
        return msgs;
    },

    generation: 0,

    resetSession: () =>
        set((s) => ({
            question: '',
            messages: [],
            pendingMessages: [],
            phase: 'idle',
            clusteredResults: [],
            discussionGroups: [],
            generation: s.generation + 1,
            agents: s.agents.map((a) => ({ ...a, answer: '', trace: [] })),
        })),
}));
