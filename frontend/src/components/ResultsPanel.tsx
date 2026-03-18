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

function ProgressBar({ phase, totalAgents }: { phase: Phase; totalAgents: number }) {
    const agents = useAgentStore((s) => s.agents);
    const discussionGroups = useAgentStore((s) => s.discussionGroups);

    if (phase === 'idle' || totalAgents === 0) return null;

    // Agents in active (not completed) discussion groups
    const discussingIds = new Set<string>();
    for (const g of discussionGroups) {
        if (!g.completed) {
            for (const id of g.agentIds) discussingIds.add(id);
        }
    }

    // Agents with an answer and not in active discussion are "vibing" (done)
    const vibingCount = agents.filter((a) => a.answer && !discussingIds.has(a.id)).length;
    const discussingCount = discussingIds.size;
    const thinkingCount = totalAgents - vibingCount - discussingCount;

    const thinkingPct = Math.round((thinkingCount / totalAgents) * 100);
    const discussingPct = Math.round((discussingCount / totalAgents) * 100);
    const vibingPct = 100 - thinkingPct - discussingPct;

    const isComplete = phase === 'complete';

    return (
        <div className="progress-tracker">
            <div className="progress-bar-bg">
                {thinkingPct > 0 && (
                    <div className="progress-bar-thinking" style={{ width: `${thinkingPct}%` }} />
                )}
                {discussingPct > 0 && (
                    <div className="progress-bar-discussing" style={{ width: `${discussingPct}%` }} />
                )}
                {vibingPct > 0 && (
                    <div className="progress-bar-vibing" style={{ width: `${vibingPct}%` }} />
                )}
            </div>
            <div className="progress-labels">
                {isComplete ? (
                    <span className="progress-label vibing">{totalAgents} agents — vibing</span>
                ) : (
                    <>
                        {thinkingCount > 0 && <span className="progress-label thinking">{thinkingCount} thinking</span>}
                        {discussingCount > 0 && <span className="progress-label discussing">{discussingCount} discussing</span>}
                        {vibingCount > 0 && <span className="progress-label vibing">{vibingCount} vibing</span>}
                    </>
                )}
            </div>
        </div>
    );
}

export default function ResultsPanel({ question, clusters, phase, totalAgents }: ResultsPanelProps) {
    const [expandedCluster, setExpandedCluster] = useState<number | null>(null);
    const agents = useAgentStore((s) => s.agents);
    const setSelectedAgentId = useAgentStore((s) => s.setSelectedAgentId);
    const clusterColors = useAgentStore((s) => s.clusterColors);

    if (!question) {
        return (
            <div className="results-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.3, marginBottom: 14 }}>
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p>Ask a question to see how the crowd thinks</p>
            </div>
        );
    }

    const isWorking = phase !== 'idle' && phase !== 'complete';

    const totalVotes = clusters.reduce((s, c) => s + c.count, 0) || totalAgents;

    return (
        <div className="results-panel">
            <ProgressBar phase={phase} totalAgents={totalAgents} />

            {isWorking && clusters.length === 0 && (
                <div className="results-loading" style={{ height: 'auto', padding: '20px 0' }}>
                    <div className="results-spinner" />
                    <p>Waiting for first results...</p>
                </div>
            )}

            <div className="results-clusters">
                {clusters.map((cluster, i) => {
                    const pct = totalVotes > 0 ? Math.round((cluster.count / totalVotes) * 100) : 0;
                    const isExpanded = expandedCluster === i;
                    return (
                        <div key={i} className="cluster-card" style={{ cursor: 'pointer' }}
                            onClick={() => setExpandedCluster(isExpanded ? null : i)}>
                            <div className="cluster-header">
                                {clusterColors[cluster.label] && (
                                    <span style={{
                                        display: 'inline-block',
                                        width: 10,
                                        height: 10,
                                        borderRadius: '50%',
                                        background: clusterColors[cluster.label],
                                        flexShrink: 0,
                                        marginRight: 7,
                                    }} />
                                )}
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
                                    {[...new Set(cluster.agentIds)].map((agentId) => {
                                        const agent = agents.find((a) => a.id === agentId);
                                        if (!agent) return null;
                                        return (
                                            <div
                                                key={`${i}-${agentId}`}
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
