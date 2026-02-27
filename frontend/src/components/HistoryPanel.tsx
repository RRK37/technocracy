'use client';

import { useEffect } from 'react';
import { useAgentStore } from '@/src/store/agentStore';
import { supabase } from '@/src/lib/supabase';
import { useAuth } from '@/src/providers/AuthProvider';

export default function HistoryPanel() {
    const { user } = useAuth();
    const { history, setHistory } = useAgentStore();

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

        loadHistory();
    }, [user, setHistory]);

    if (!user) {
        return <div className="history-empty">Sign in to see your history</div>;
    }

    if (history.length === 0) {
        return (
            <div className="history-empty">
                <p>No questions yet. Ask something!</p>
            </div>
        );
    }

    return (
        <div className="history-panel">
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
    );
}
