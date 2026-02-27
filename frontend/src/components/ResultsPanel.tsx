'use client';

import type { ThemeCluster } from '@/src/types/agent';
import type { Phase } from '@/src/store/agentStore';

interface ResultsPanelProps {
    question: string;
    clusters: ThemeCluster[];
    phase: Phase;
    totalAgents: number;
}

export default function ResultsPanel({ question, clusters, phase, totalAgents }: ResultsPanelProps) {
    if (!question) {
        return (
            <div className="results-empty">
                <div className="results-empty-icon">💭</div>
                <p>Ask a question to see how the crowd thinks</p>
            </div>
        );
    }

    if (phase !== 'complete' && clusters.length === 0) {
        return (
            <div className="results-loading">
                <div className="results-spinner" />
                <p>Agents are deliberating...</p>
            </div>
        );
    }

    const totalVotes = clusters.reduce((s, c) => s + c.count, 0) || totalAgents;

    return (
        <div className="results-panel">
            <div className="results-summary">
                <span className="results-total">{totalAgents}</span> agents deliberating
            </div>

            <div className="results-clusters">
                {clusters.map((cluster, i) => {
                    const pct = totalVotes > 0 ? Math.round((cluster.count / totalVotes) * 100) : 0;
                    return (
                        <div key={i} className="cluster-card">
                            <div className="cluster-header">
                                <span className="cluster-label">{cluster.label}</span>
                                <span className="cluster-count">
                                    {cluster.count} <span className="cluster-pct">({pct}%)</span>
                                </span>
                            </div>
                            <div className="cluster-bar-bg">
                                <div
                                    className="cluster-bar-fill"
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
