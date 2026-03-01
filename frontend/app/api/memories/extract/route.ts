import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/src/lib/supabase-server';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
    try {
        // Support both JSON and sendBeacon (plain text / form data)
        const contentType = req.headers.get('content-type') || '';
        let body: { messages: { role: string; text: string }[]; question: string; accessToken: string };

        if (contentType.includes('application/json')) {
            body = await req.json();
        } else {
            const text = await req.text();
            body = JSON.parse(text);
        }

        const { messages, question, accessToken } = body;
        console.log('[extract] received request, messages:', messages?.length, 'hasToken:', !!accessToken);

        if (!messages?.length || !accessToken) {
            console.log('[extract] missing messages or token');
            return NextResponse.json({ error: 'Missing messages or accessToken' }, { status: 400 });
        }

        // Verify user
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken);
        console.log('[extract] auth result:', user?.id, 'error:', authError?.message);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Format conversation for extraction
        const conversation = messages
            .map((m) => `${m.role === 'user' ? 'User' : 'System'}: ${m.text}`)
            .join('\n');

        // Extract user facts via GPT-4o-mini
        const extraction = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: `Extract factual information about the USER from this conversation. Only extract facts that the user has directly stated or clearly implied about themselves. Each fact should be a standalone statement about the user.

Examples of good extractions:
- "User is a software engineer"
- "User lives in New York"
- "User has two children"
- "User is interested in climate change"

Do NOT extract:
- Opinions the user asked about (those are questions, not facts about them)
- Facts about other people or topics
- Speculative or uncertain information

Respond with a JSON object: { "memories": ["fact1", "fact2", ...] }
If no personal facts can be extracted, return { "memories": [] }`,
                },
                {
                    role: 'user',
                    content: `Question asked: "${question}"\n\nConversation:\n${conversation}`,
                },
            ],
            max_tokens: 500,
            temperature: 0.3,
            response_format: { type: 'json_object' },
        });

        const extracted = JSON.parse(extraction.choices[0].message.content || '{"memories":[]}');
        const memories: string[] = extracted.memories || [];
        console.log('[extract] GPT extracted memories:', memories);

        if (memories.length === 0) {
            return NextResponse.json({ stored: 0 });
        }

        // Embed all memories in one batch
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: memories,
        });

        let stored = 0;

        for (let i = 0; i < memories.length; i++) {
            const memory = memories[i];
            const embedding = embeddingResponse.data[i].embedding;

            // Check for similar existing memories (threshold 0.85)
            const { data: similar, error: rpcError } = await supabaseAdmin.rpc('match_user_memories', {
                query_embedding: JSON.stringify(embedding),
                match_user_id: user.id,
                match_threshold: 0.85,
                match_count: 1,
            });

            console.log('[extract] dedup check for:', memory, 'similar:', similar?.length, 'rpcError:', rpcError?.message);

            if (similar && similar.length > 0) {
                continue;
            }

            // Insert new unique memory
            const { error: insertError } = await supabaseAdmin
                .from('user_memories')
                .insert({
                    user_id: user.id,
                    memory,
                    embedding: JSON.stringify(embedding),
                    source_question: question,
                });

            if (!insertError) {
                stored++;
                console.log('[extract] stored memory:', memory);
            } else {
                console.error('[extract] insert error:', insertError);
            }
        }

        console.log('[extract] done. stored:', stored, '/', memories.length);
        return NextResponse.json({ stored, total: memories.length });
    } catch (error: unknown) {
        console.error('[extract] error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
