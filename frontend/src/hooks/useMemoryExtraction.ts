'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/src/providers/AuthProvider';
import { useAgentStore } from '@/src/store/agentStore';

function buildPayload(
    messages: { role: string; text: string }[],
    question: string,
    accessToken: string,
): string | null {
    if (!messages.length || !question || !accessToken) return null;
    return JSON.stringify({ messages, question, accessToken });
}

export function useMemoryExtraction() {
    const { session } = useAuth();
    // Tracks whether we already sent via the button (so beacon doesn't double-fire)
    const sentViaButton = useRef(false);

    // Reset the flag when question clears (new session)
    useEffect(() => {
        const unsub = useAgentStore.subscribe((state) => {
            if (state.question === '') {
                sentViaButton.current = false;
            }
        });
        return unsub;
    }, []);

    // Called explicitly from "New Question" button — always fires
    const extractMemories = useCallback(
        (messages: { role: string; text: string }[], question: string) => {
            if (!session?.access_token) return;

            const payload = buildPayload(messages, question, session.access_token);
            if (!payload) return;

            sentViaButton.current = true;

            fetch('/api/memories/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: payload,
            }).catch(() => {});
        },
        [session],
    );

    // Beacon fallback for page close / tab close (only if button wasn't used)
    useEffect(() => {
        const handleBeacon = () => {
            if (sentViaButton.current) return;
            if (!session?.access_token) return;

            const { messages, question } = useAgentStore.getState();
            const payload = buildPayload(messages, question, session.access_token);
            if (!payload) return;

            navigator.sendBeacon('/api/memories/extract', payload);
        };

        // Only fire on beforeunload — NOT on visibilitychange
        // (visibilitychange fires on every tab switch, which is too aggressive)
        window.addEventListener('beforeunload', handleBeacon);

        return () => {
            window.removeEventListener('beforeunload', handleBeacon);
        };
    }, [session]);

    return { extractMemories };
}
