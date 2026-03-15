import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const MAX_QUESTION_LEN = 500;
const MAX_PARTICIPANTS = 10;
const MAX_NAME_LEN = 100;
const MAX_PERSONA_LEN = 1000;
const MAX_CONVERSATION_LEN = 8000;
const MAX_TRACE_ITEMS = 10;
const MAX_TRACE_ITEM_LEN = 3000;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { participants, question, conversationSoFar, currentSpeaker } = body;

        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return NextResponse.json({ error: 'question is required' }, { status: 400 });
        }
        if (question.length > MAX_QUESTION_LEN) {
            return NextResponse.json({ error: `question must be ${MAX_QUESTION_LEN} characters or fewer` }, { status: 400 });
        }
        if (!Array.isArray(participants) || participants.length < 2 || participants.length > MAX_PARTICIPANTS) {
            return NextResponse.json({ error: `participants must be an array of 2-${MAX_PARTICIPANTS} items` }, { status: 400 });
        }
        for (const p of participants) {
            if (!p || typeof p.name !== 'string' || p.name.length > MAX_NAME_LEN) {
                return NextResponse.json({ error: 'each participant must have a valid name' }, { status: 400 });
            }
        }
        if (conversationSoFar !== undefined && conversationSoFar !== null) {
            if (typeof conversationSoFar !== 'string' || conversationSoFar.length > MAX_CONVERSATION_LEN) {
                return NextResponse.json({ error: `conversationSoFar must be a string of ${MAX_CONVERSATION_LEN} characters or fewer` }, { status: 400 });
            }
        }
        if (!currentSpeaker || typeof currentSpeaker.name !== 'string' || currentSpeaker.name.length > MAX_NAME_LEN) {
            return NextResponse.json({ error: 'currentSpeaker must have a valid name' }, { status: 400 });
        }
        if (typeof currentSpeaker.persona !== 'string' || currentSpeaker.persona.length > MAX_PERSONA_LEN) {
            return NextResponse.json({ error: 'currentSpeaker persona must be a string of 1000 characters or fewer' }, { status: 400 });
        }
        if (currentSpeaker.trace !== undefined && currentSpeaker.trace !== null) {
            if (!Array.isArray(currentSpeaker.trace) || currentSpeaker.trace.length > MAX_TRACE_ITEMS) {
                return NextResponse.json({ error: `currentSpeaker trace must be an array of ${MAX_TRACE_ITEMS} items or fewer` }, { status: 400 });
            }
            for (const item of currentSpeaker.trace) {
                if (typeof item !== 'string' || item.length > MAX_TRACE_ITEM_LEN) {
                    return NextResponse.json({ error: `each trace item must be a string of ${MAX_TRACE_ITEM_LEN} characters or fewer` }, { status: 400 });
                }
            }
        }

        const participantNames = participants.map((p: { name: string }) => p.name).join(', ');

        const traceContext = currentSpeaker.trace?.length > 0
            ? `\n\nYour previous thoughts:\n${currentSpeaker.trace.slice(-3).map((t: string, i: number) => `[${i + 1}] ${t}`).join('\n')}`
            : '';

        const conversationContext = conversationSoFar
            ? `\n\nThe conversation so far:\n${conversationSoFar}`
            : '\n\nYou are the first to speak.';

        const systemPrompt = `You are ${currentSpeaker.name}. ${currentSpeaker.persona}

You are in a group discussion with: ${participantNames}.
The topic is: "${question}"${traceContext}${conversationContext}

Respond naturally as ${currentSpeaker.name}. Share your opinion in 1-3 sentences. Be conversational, not formal. Don't repeat what others have said unless you're responding to it.

Respond with a JSON object:
- "speaker": "${currentSpeaker.name}"
- "message": your response

Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4.1-nano',
            messages: [{ role: 'system', content: systemPrompt }],
            max_tokens: 400,
            temperature: 1.0,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content || '{}';
        let parsed;
        try {
            parsed = JSON.parse(content);
        } catch {
            // Truncated JSON — extract what we can
            const speakerMatch = content.match(/"speaker"\s*:\s*"([^"]+)"/);
            const messageMatch = content.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)/);
            parsed = {
                speaker: speakerMatch?.[1] || currentSpeaker.name,
                message: messageMatch?.[1]?.replace(/\\"/g, '"').replace(/\\n/g, ' ') || 'I agree with the points raised.',
            };
        }

        return NextResponse.json(parsed);
    } catch (error: unknown) {
        console.error('Discuss API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
