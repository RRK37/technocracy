import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Power-iteration PCA: project N high-dim vectors to 2D using the gram matrix trick.
 * Since N << dim (e.g. 6 clusters, 1536 dims), this is fast and exact.
 * Returns [x, y] coordinates for each input vector.
 */
function gramPCA2D(vectors: number[][]): [number, number][] {
    const n = vectors.length;
    if (n === 1) return [[1, 0]];

    const dim = vectors[0].length;

    // Center
    const mean = new Array(dim).fill(0);
    for (const v of vectors) v.forEach((x, i) => { mean[i] += x / n; });
    const C = vectors.map(v => v.map((x, i) => x - mean[i]));

    // Gram matrix G = C @ C^T  (N×N)
    const G: number[][] = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) =>
            C[i].reduce((s, x, k) => s + x * C[j][k], 0)
        )
    );

    function powerIter(exclude?: number[]): number[] {
        // Deterministic seed: use the diagonal to avoid sign ambiguity
        let v = G.map((row) => row[0]);
        let norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
        if (norm < 1e-12) v = Array.from({ length: n }, (_, i) => i === 0 ? 1 : 0);
        else v = v.map(x => x / norm);

        for (let iter = 0; iter < 300; iter++) {
            // v = G @ v
            const nv = Array(n).fill(0);
            for (let i = 0; i < n; i++)
                for (let j = 0; j < n; j++)
                    nv[i] += G[i][j] * v[j];
            // Deflate: remove component along excluded direction
            if (exclude) {
                const dot = nv.reduce((s, x, i) => s + x * exclude[i], 0);
                for (let i = 0; i < n; i++) nv[i] -= dot * exclude[i];
            }
            norm = Math.sqrt(nv.reduce((s, x) => s + x * x, 0));
            if (norm < 1e-12) break;
            const next = nv.map(x => x / norm);
            // Converged?
            const diff = next.reduce((s, x, i) => s + (x - v[i]) ** 2, 0);
            v = next;
            if (diff < 1e-20) break;
        }
        // Make sign deterministic: largest-magnitude element is positive
        const maxIdx = v.reduce((mi, x, i) => Math.abs(x) > Math.abs(v[mi]) ? i : mi, 0);
        if (v[maxIdx] < 0) for (let i = 0; i < n; i++) v[i] = -v[i];
        return v;
    }

    const e1 = powerIter();
    const e2 = powerIter(e1);

    return Array.from({ length: n }, (_, i) => [e1[i], e2[i]]);
}

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

export async function POST(req: NextRequest) {
    try {
        const { labels } = await req.json() as { labels: string[] };

        if (!Array.isArray(labels) || labels.length === 0) {
            return NextResponse.json({ colors: {} });
        }

        if (labels.length === 1) {
            return NextResponse.json({ colors: { [labels[0]]: '#3498db' } });
        }

        // Embed all cluster labels
        const response = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: labels,
        });
        const vectors = response.data
            .sort((a, b) => a.index - b.index)
            .map(e => e.embedding);

        // Project to 2D via gram-matrix PCA
        const coords = gramPCA2D(vectors);

        // Normalize so the spread is relative to this cluster set
        const maxDist = Math.max(...coords.map(([x, y]) => Math.sqrt(x * x + y * y)));
        const normalized: [number, number][] = maxDist > 1e-9
            ? coords.map(([x, y]) => [x / maxDist, y / maxDist])
            : coords;

        // Map angle in 2D PCA space → hue
        const colors: Record<string, string> = {};
        labels.forEach((label, i) => {
            const [x, y] = normalized[i];
            const angle = Math.atan2(y, x); // -π to π
            const hue = ((angle / (2 * Math.PI)) * 360 + 360) % 360;
            colors[label] = hslToHex(hue, 68, 50);
        });

        return NextResponse.json({ colors });
    } catch (err) {
        console.error('cluster-colors error:', err);
        return NextResponse.json({ error: 'failed' }, { status: 500 });
    }
}
