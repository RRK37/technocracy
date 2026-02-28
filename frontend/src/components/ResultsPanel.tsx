'use client';

import { useState } from 'react';
import type { ThemeCluster } from '@/src/types/agent';
import type { Phase } from '@/src/store/agentStore';
import { useAgentStore } from '@/src/store/agentStore';

interface ResultsPanelProps {
    question: string;
    clusters: ThemeCluster[];
    phase: Phase;
    totalAgents: number;
}

export default function ResultsPanel({ question, clusters, phase, totalAgents }: ResultsPanelProps) {
    const [expandedCluster, setExpandedCluster] = useState<number | null>(null);
    const agents = useAgentStore((s) => s.agents);
    const setSelectedAgentId = useAgentStore((s) => s.setSelectedAgentId);

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
                    const isExpanded = expandedCluster === i;
                    return (
                        <div key={i} className="cluster-card" style={{ cursor: 'pointer' }}
                            onClick={() => setExpandedCluster(isExpanded ? null : i)}>
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
                            {isExpanded && (
                                <div className="cluster-agents" onClick={(e) => e.stopPropagation()}>
                                    {cluster.agentIds.map((agentId) => {
                                        const agent = agents.find((a) => a.id === agentId);
                                        if (!agent) return null;
                                        return (
                                            <div
                                                key={agentId}
                                                className="cluster-agent-row"
                                                onClick={() => setSelectedAgentId(agentId)}
                                            >
                                                <span className="cluster-agent-name">{agent.data.name}</span>
                                                <span className="cluster-agent-answer">
                                                    {agent.answer
                                                        ? agent.answer.length > 80
                                                            ? agent.answer.slice(0, 80) + '...'
                                                            : agent.answer
                                                        : 'No answer yet'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
