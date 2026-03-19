import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const COLOR_MATCH_THRESHOLD = 0.85;

// ── In-memory color cache (lives for the duration of the server process) ──

interface CachedColor {
    centroid: number[];
    color: string;
}

/** Map from question → list of assigned centroid colors */
const colorCache = new Map<string, CachedColor[]>();

function hslToHex(h: number, s: number, l: number): string {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// ── K-means clustering helpers ────────────────────────────────────

function dot(a: number[], b: number[]): number {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
}

/** Average a set of vectors and L2-normalize the result */
function centroid(vectors: number[][]): number[] {
    const dim = vectors[0].length;
    const mean = new Array(dim).fill(0);
    for (const v of vectors) for (let i = 0; i < dim; i++) mean[i] += v[i];
    let norm = 0;
    for (let i = 0; i < dim; i++) { mean[i] /= vectors.length; norm += mean[i] * mean[i]; }
    norm = Math.sqrt(norm);
    if (norm > 1e-12) for (let i = 0; i < dim; i++) mean[i] /= norm;
    return mean;
}

/** K-means++ initialization */
function kMeansPPInit(vectors: number[][], k: number): number[][] {
    const n = vectors.length;
    const centroids: number[][] = [];
    // Pick first centroid: use a deterministic choice (index 0) for stability
    centroids.push([...vectors[0]]);

    const minDist = new Array(n).fill(Infinity);
    for (let c = 1; c < k; c++) {
        // Update distances to nearest centroid
        const last = centroids[c - 1];
        for (let i = 0; i < n; i++) {
            const d = 1 - dot(vectors[i], last); // cosine distance
            if (d < minDist[i]) minDist[i] = d;
        }
        // Pick next centroid: farthest point (deterministic variant of k-means++)
        let best = 0;
        for (let i = 1; i < n; i++) {
            if (minDist[i] > minDist[best]) best = i;
        }
        centroids.push([...vectors[best]]);
    }
    return centroids;
}

/** Run k-means with cosine similarity, return assignments and centroids */
function kMeans(vectors: number[][], k: number, maxIter = 50): { assignments: number[]; centroids: number[][] } {
    const n = vectors.length;
    let centroids = kMeansPPInit(vectors, k);
    let assignments = new Array(n).fill(0);

    for (let iter = 0; iter < maxIter; iter++) {
        // Assign each vector to nearest centroid
        const newAssignments = new Array(n);
        for (let i = 0; i < n; i++) {
            let bestC = 0, bestSim = -Infinity;
            for (let c = 0; c < k; c++) {
                const sim = dot(vectors[i], centroids[c]);
                if (sim > bestSim) { bestSim = sim; bestC = c; }
            }
            newAssignments[i] = bestC;
        }

        // Check convergence
        let changed = false;
        for (let i = 0; i < n; i++) {
            if (newAssignments[i] !== assignments[i]) { changed = true; break; }
        }
        assignments = newAssignments;
        if (!changed) break;

        // Recompute centroids
        const groups: number[][][] = Array.from({ length: k }, () => []);
        for (let i = 0; i < n; i++) groups[assignments[i]].push(vectors[i]);
        centroids = groups.map((g, c) => g.length > 0 ? centroid(g) : centroids[c]);
    }

    return { assignments, centroids };
}

/** Silhouette score for a given clustering */
function silhouetteScore(vectors: number[][], assignments: number[], k: number): number {
    const n = vectors.length;
    if (n <= 1 || k <= 1 || k >= n) return -1;

    // Precompute pairwise cosine distances
    const dist = (i: number, j: number) => 1 - dot(vectors[i], vectors[j]);

    let totalScore = 0;
    for (let i = 0; i < n; i++) {
        const myCluster = assignments[i];
        // Mean intra-cluster distance
        let intraSum = 0, intraCount = 0;
        for (let j = 0; j < n; j++) {
            if (j !== i && assignments[j] === myCluster) {
                intraSum += dist(i, j);
                intraCount++;
            }
        }
        const a = intraCount > 0 ? intraSum / intraCount : 0;

        // Mean distance to nearest other cluster
        let bestB = Infinity;
        for (let c = 0; c < k; c++) {
            if (c === myCluster) continue;
            let sum = 0, count = 0;
            for (let j = 0; j < n; j++) {
                if (assignments[j] === c) { sum += dist(i, j); count++; }
            }
            if (count > 0) bestB = Math.min(bestB, sum / count);
        }
        const b = bestB === Infinity ? 0 : bestB;

        const denom = Math.max(a, b);
        totalScore += denom > 0 ? (b - a) / denom : 0;
    }
    return totalScore / n;
}

/** Try k = 2..maxK, return the best k by silhouette score */
function chooseBestK(vectors: number[][]): number {
    const n = vectors.length;
    if (n <= 2) return 1;
    const maxK = Math.min(8, Math.floor(n / 2));
    if (maxK < 2) return 1;

    let bestK = 2, bestScore = -Infinity;
    for (let k = 2; k <= maxK; k++) {
        const { assignments } = kMeans(vectors, k);
        const score = silhouetteScore(vectors, assignments, k);
        if (score > bestScore) { bestScore = score; bestK = k; }
    }
    return bestK;
}

/** Pick a hue that's maximally distant from already-used hues */
function pickDistinctHue(usedHues: number[]): number {
    if (usedHues.length === 0) return 220; // start with blue
    // Test 360 candidate hues, pick the one farthest from all used hues
    let bestHue = 0, bestMinDist = -1;
    for (let h = 0; h < 360; h++) {
        let minDist = Infinity;
        for (const used of usedHues) {
            const d = Math.min(Math.abs(h - used), 360 - Math.abs(h - used));
            if (d < minDist) minDist = d;
        }
        if (minDist > bestMinDist) { bestMinDist = minDist; bestHue = h; }
    }
    return bestHue;
}

/** Extract hue from a hex color */
function hexToHue(hex: string): number {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0;
    let h = 0;
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
}

// ── Color cache helpers ──────────────────────────────────────────

/** Find a cached color whose centroid is similar enough, or return null */
function matchCachedColor(
    centroidVec: number[],
    question: string,
): { color: string; index: number } | null {
    const entries = colorCache.get(question);
    if (!entries) return null;
    let bestIdx = -1, bestSim = -Infinity;
    for (let i = 0; i < entries.length; i++) {
        const sim = dot(centroidVec, entries[i].centroid);
        if (sim > bestSim) { bestSim = sim; bestIdx = i; }
    }
    if (bestSim >= COLOR_MATCH_THRESHOLD) {
        return { color: entries[bestIdx].color, index: bestIdx };
    }
    return null;
}

/** Store or update a centroid→color mapping in the cache */
function setCachedColor(question: string, centroidVec: number[], color: string, index?: number): void {
    if (!colorCache.has(question)) colorCache.set(question, []);
    const entries = colorCache.get(question)!;
    if (index !== undefined) {
        entries[index] = { centroid: centroidVec, color };
    } else {
        entries.push({ centroid: centroidVec, color });
    }
}

// ── Validation constants ──────────────────────────────────────────

const MAX_QUESTION_LEN = 500;
const MAX_ANSWERS = 150;
const MAX_ANSWER_LEN = 500;
const MAX_AGENT_ID_LEN = 50;

// ── Route handler ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { answers, question } = body;

        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return NextResponse.json({ error: 'question is required' }, { status: 400 });
        }
        if (question.length > MAX_QUESTION_LEN) {
            return NextResponse.json({ error: `question must be ${MAX_QUESTION_LEN} characters or fewer` }, { status: 400 });
        }
        if (!Array.isArray(answers) || answers.length === 0) {
            return NextResponse.json({ error: 'answers must be a non-empty array' }, { status: 400 });
        }
        if (answers.length > MAX_ANSWERS) {
            return NextResponse.json({ error: `answers must have ${MAX_ANSWERS} items or fewer` }, { status: 400 });
        }
        for (const a of answers) {
            if (!a || typeof a.agentId !== 'string' || a.agentId.length > MAX_AGENT_ID_LEN) {
                return NextResponse.json({ error: 'each answer must have a valid agentId' }, { status: 400 });
            }
            if (typeof a.answer !== 'string' || a.answer.length > MAX_ANSWER_LEN) {
                return NextResponse.json({ error: `each answer must be a string of ${MAX_ANSWER_LEN} characters or fewer` }, { status: 400 });
            }
        }

        // ── Stage 1: Embed all answer texts ──
        const embResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: answers.map((a: { answer: string }) => a.answer),
        });
        const vectors = embResponse.data
            .sort((a, b) => a.index - b.index)
            .map(e => e.embedding);

        // ── Stage 2: Algorithmic clustering ──
        const k = chooseBestK(vectors);
        const { assignments, centroids } = kMeans(vectors, k);

        // Group answers by cluster
        const groups: { agentId: string; answer: string }[][] = Array.from({ length: k }, () => []);
        assignments.forEach((c, i) => groups[c].push(answers[i]));

        // Remove empty clusters (can happen if k-means leaves one empty)
        const nonEmpty = groups
            .map((g, i) => ({ group: g, centroid: centroids[i] }))
            .filter(({ group }) => group.length > 0);

        // ── Stage 3: LLM labels + sentiment ──
        const clusterDescriptions = nonEmpty
            .map(({ group }, i) => {
                const answerLines = group.map(a => `- ${a.answer}`).join('\n');
                return `Cluster ${i + 1} (${group.length} answers):\n${answerLines}`;
            })
            .join('\n\n');

        const labelPrompt = `You are labeling pre-grouped answer clusters for the question: "${question}"

${clusterDescriptions}

For each cluster, provide a concise label (2-5 words) and a sentiment.
If the question is a yes/no question, use "Yes" and "No" as labels where appropriate.

Respond with JSON only:
{ "clusters": [ { "label": "Theme name", "sentiment": "positive" | "negative" | "neutral" } ] }

You MUST return exactly ${nonEmpty.length} cluster entries, one per cluster above, in the same order. Respond ONLY with valid JSON, no markdown.`;

        const labelResponse = await openai.chat.completions.create({
            model: 'gpt-4.1-nano',
            messages: [{ role: 'system', content: labelPrompt }],
            max_tokens: 500,
            temperature: 0.3,
            response_format: { type: 'json_object' },
        });

        const labelContent = labelResponse.choices[0].message.content;
        const labelParsed = JSON.parse(labelContent || '{"clusters":[]}');
        const clusterLabels: { label: string; sentiment: string }[] = labelParsed.clusters || [];

        // ── Assemble response with cached colors ──
        const usedHues: number[] = [];
        const themes = [];

        for (let i = 0; i < nonEmpty.length; i++) {
            const { group, centroid: c } = nonEmpty[i];
            const label = clusterLabels[i]?.label ?? `Group ${i + 1}`;
            let color: string;

            const cached = matchCachedColor(c, question);
            if (cached) {
                color = cached.color;
                // Update centroid in cache (it drifts as more answers arrive)
                setCachedColor(question, c, color, cached.index);
            } else {
                const hue = pickDistinctHue(usedHues);
                color = hslToHex(hue, 68, 50);
                setCachedColor(question, c, color);
            }

            usedHues.push(hexToHue(color));
            themes.push({
                label,
                count: group.length,
                agentIds: group.map(a => a.agentId),
                sentiment: clusterLabels[i]?.sentiment ?? 'neutral',
                color,
            });
        }

        // Sort by count descending
        themes.sort((a, b) => b.count - a.count);

        return NextResponse.json({ themes });
    } catch (error: unknown) {
        console.error('Cluster API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
