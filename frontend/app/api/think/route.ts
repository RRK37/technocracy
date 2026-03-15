import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const MAX_QUESTION_LEN = 500;
const MAX_NAME_LEN = 100;
const MAX_PERSONA_LEN = 1000;
const MAX_TRACE_ITEMS = 10;
const MAX_TRACE_ITEM_LEN = 3000;

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { name, persona, trace, question } = body;

        if (!question || typeof question !== 'string' || question.trim().length === 0) {
            return NextResponse.json({ error: 'question is required' }, { status: 400 });
        }
        if (question.length > MAX_QUESTION_LEN) {
            return NextResponse.json({ error: `question must be ${MAX_QUESTION_LEN} characters or fewer` }, { status: 400 });
        }
        if (!name || typeof name !== 'string' || name.length > MAX_NAME_LEN) {
            return NextResponse.json({ error: 'name is required and must be 100 characters or fewer' }, { status: 400 });
        }
        if (!persona || typeof persona !== 'string' || persona.length > MAX_PERSONA_LEN) {
            return NextResponse.json({ error: 'persona is required and must be 1000 characters or fewer' }, { status: 400 });
        }
        if (trace !== undefined && trace !== null) {
            if (!Array.isArray(trace)) {
                return NextResponse.json({ error: 'trace must be an array' }, { status: 400 });
            }
            if (trace.length > MAX_TRACE_ITEMS) {
                return NextResponse.json({ error: `trace must have ${MAX_TRACE_ITEMS} items or fewer` }, { status: 400 });
            }
            for (const item of trace) {
                if (typeof item !== 'string' || item.length > MAX_TRACE_ITEM_LEN) {
                    return NextResponse.json({ error: `each trace item must be a string of ${MAX_TRACE_ITEM_LEN} characters or fewer` }, { status: 400 });
                }
            }
        }

        const traceContext = trace && trace.length > 0
            ? `\n\nYour previous thoughts and experiences:\n${trace.map((t: string, i: number) => `[${i + 1}] ${t}`).join('\n')}`
            : '';

        const systemPrompt = `You are ${name}. ${persona}

This question was put to you: "${question}"

Answer it. Your values, experiences, and instincts shape everything about how you see this — let that come through. State your position clearly. Don't hedge to seem balanced unless that's genuinely who you are. Don't explain your own personality — just think and speak as yourself.${traceContext}

Respond with a JSON object containing:
- "reasoning": Your raw internal reaction (2-4 sentences — gut feelings, associations, things this reminds you of)
- "answer": Your position (1-3 sentences, direct, to the person asking)

Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4.1-nano',
            messages: [{ role: 'system', content: systemPrompt }],
            max_tokens: 300,
            temperature: 0.9,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content || '{}');

        return NextResponse.json(parsed);
    } catch (error: unknown) {
        console.error('Think API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
