'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';
import type { UserMemory } from '@/src/types/agent';

export default function HistoryPanel() {
    const { user, session } = useAuth();
    const { history, setHistory } = useAgentStore();
    const [memories, setMemories] = useState<UserMemory[]>([]);
    const [addingMemory, setAddingMemory] = useState(false);
    const [newMemoryText, setNewMemoryText] = useState('');
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!user) return;

        async function loadHistory() {
            const { data, error } = await supabase
                .from('question_history')
                .select('*')
                .eq('user_id', user!.id)
                .order('created_at', { ascending: false })
                .limit(50);

            if (data && !error) {
                setHistory(data);
            }
        }

        async function loadMemories() {
            const { data, error } = await supabase
                .from('user_memories')
                .select('id, user_id, memory, source_question, created_at')
                .eq('user_id', user!.id)
                .order('created_at', { ascending: false });

            if (data && !error) {
                setMemories(data);
            }
        }

        loadHistory();
        loadMemories();
    }, [user, setHistory]);

    const handleDeleteMemory = useCallback(async (id: string) => {
        const { error } = await supabase
            .from('user_memories')
            .delete()
            .eq('id', id);

        if (!error) {
            setMemories((prev) => prev.filter((m) => m.id !== id));
        }
    }, []);

    const handleAddMemory = useCallback(async () => {
        if (!newMemoryText.trim() || !session?.access_token) return;

        setSaving(true);
        try {
            const res = await fetch('/api/memories/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'user', text: newMemoryText.trim() }],
                    question: 'Manual memory entry',
                    accessToken: session.access_token,
                    directMemory: newMemoryText.trim(),
                }),
            });

            if (res.ok) {
                // Reload memories
                const { data } = await supabase
                    .from('user_memories')
                    .select('id, user_id, memory, source_question, created_at')
                    .eq('user_id', user!.id)
                    .order('created_at', { ascending: false });

                if (data) setMemories(data);
            }
        } catch (err) {
            console.error('Failed to add memory:', err);
        }

        setNewMemoryText('');
        setAddingMemory(false);
        setSaving(false);
    }, [newMemoryText, session, user]);

    if (!user) {
        return <div className="history-empty">Sign in to see your history</div>;
    }

    return (
        <div className="history-panel">
            {/* Memories Section */}
            <div className="history-section">
                <div className="history-section-header">
                    <h3 className="history-section-title">Memory</h3>
                    <button
                        className="memory-add-btn"
                        onClick={() => setAddingMemory(!addingMemory)}
                        title="Add memory"
                    >
                        +
                    </button>
                </div>

                {addingMemory && (
                    <div className="memory-add-form">
                        <input
                            className="memory-add-input"
                            type="text"
                            placeholder="e.g. I'm a teacher in Berlin"
                            value={newMemoryText}
                            onChange={(e) => setNewMemoryText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleAddMemory();
                                if (e.key === 'Escape') {
                                    setAddingMemory(false);
                                    setNewMemoryText('');
                                }
                            }}
                            autoFocus
                            disabled={saving}
                        />
                        <button
                            className="memory-save-btn"
                            onClick={handleAddMemory}
                            disabled={!newMemoryText.trim() || saving}
                        >
                            {saving ? '...' : 'Save'}
                        </button>
                    </div>
                )}

                {memories.length === 0 ? (
                    <div className="memory-empty">
                        No memories yet. They'll be extracted from your conversations.
                    </div>
                ) : (
                    <div className="memory-list">
                        {memories.map((m) => (
                            <div key={m.id} className="memory-item">
                                <span className="memory-text">{m.memory}</span>
                                <button
                                    className="memory-delete-btn"
                                    onClick={() => handleDeleteMemory(m.id)}
                                    title="Delete memory"
                                >
                                    &times;
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Results Section */}
            <div className="history-section">
                <div className="history-section-header">
                    <h3 className="history-section-title">Past Results</h3>
                </div>

                {history.length === 0 ? (
                    <div className="memory-empty">
                        No questions yet. Ask something!
                    </div>
                ) : (
                    <div className="history-results-list">
                        {history.map((item) => (
                            <div key={item.id} className="history-item">
                                <div className="history-question">{item.question}</div>
                                <div className="history-meta">
                                    {new Date(item.created_at).toLocaleDateString()} •{' '}
                                    {item.clustered_results.total_agents} agents
                                </div>
                                <div className="history-themes">
                                    {item.clustered_results.themes.map((theme, i) => (
                                        <span key={i} className="history-tag">
                                            {theme.label} ({theme.count})
                                        </span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
