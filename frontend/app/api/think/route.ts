import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const { name, persona, trace, question } = await req.json();

        const traceContext = trace && trace.length > 0
            ? `\n\nYour previous thoughts and experiences:\n${trace.map((t: string, i: number) => `[${i + 1}] ${t}`).join('\n')}`
            : '';

        const systemPrompt = `You are ${name}. ${persona}

Someone has come to you for advice. They are asking the community for their perspectives. Think about their question carefully from your unique perspective, then give them your honest advice.${traceContext}

Their question is: "${question}"

Respond with a JSON object containing:
- "reasoning": Your internal thought process (2-4 sentences of pondering from your character's perspective)
- "answer": Your advice to the person asking (1-3 sentences, speak directly to them using "you", give a clear position)

Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
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
