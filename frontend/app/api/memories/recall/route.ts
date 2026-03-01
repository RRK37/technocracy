import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/src/lib/supabase-server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
    try {
        const { question, accessToken } = await req.json();

        if (!question || !accessToken) {
            return NextResponse.json({ error: 'Missing question or accessToken' }, { status: 400 });
        }

        // Verify user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Embed the question
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: question,
        });

        const queryEmbedding = embeddingResponse.data[0].embedding;

        // Find similar memories
        const { data: matches, error: matchError } = await supabaseAdmin.rpc('match_user_memories', {
            query_embedding: JSON.stringify(queryEmbedding),
            match_user_id: user.id,
            match_threshold: 0.5,
            match_count: 10,
        });

        if (matchError) {
            return NextResponse.json({ memories: [] });
        }

        const memories = (matches || []).map((m: { memory: string }) => m.memory);

        return NextResponse.json({ memories });
    } catch (error: unknown) {
        console.error('Memory recall error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
