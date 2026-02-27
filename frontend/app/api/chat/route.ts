import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const { name, persona, trace, answer, userMessage } = await req.json();

        const traceContext = trace?.length > 0
            ? `\n\nYour recent thoughts:\n${trace.slice(-3).map((t: string, i: number) => `[${i + 1}] ${t}`).join('\n')}`
            : '';

        const answerContext = answer
            ? `\n\nYour current position on the main question: "${answer}"`
            : '';

        const systemPrompt = `You are ${name}. ${persona}${traceContext}${answerContext}

A person wants to talk to you. Respond in character, naturally and conversationally, in 1-3 sentences.

Respond with a JSON object:
- "reply": your response

Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userMessage },
            ],
            max_tokens: 200,
            temperature: 0.9,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content || '{"reply":"..."}');

        return NextResponse.json(parsed);
    } catch (error: unknown) {
        console.error('Chat API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
