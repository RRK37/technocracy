import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const { answers, question } = await req.json();

        const answerList = answers
            .map((a: { agentId: string; answer: string }) => `[${a.agentId}]: ${a.answer}`)
            .join('\n');

        const systemPrompt = `You are analyzing crowd responses to the question: "${question}"

Here are all the individual answers (each prefixed with the agent's ID in brackets):
${answerList}

Group these answers into common themes. Each answer must belong to exactly ONE theme — do not count the same answer in multiple themes. The total of all counts must equal exactly ${answers.length}.

If the question is a yes/no question, make sure "Yes" and "No" are themes.

Respond with a JSON object:
{
  "themes": [
    { "label": "Theme name", "count": number, "agentIds": ["id1", "id2"], "sentiment": "positive" | "negative" | "neutral" }
  ]
}

The "agentIds" array MUST contain the exact agent IDs (from the brackets) of each agent whose answer belongs to that theme. The count must equal the length of the agentIds array.

Keep theme labels concise (2-5 words). Order by count descending. Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'system', content: systemPrompt }],
            max_tokens: 500,
            temperature: 0.3,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content || '{"themes":[]}');

        return NextResponse.json(parsed);
    } catch (error: unknown) {
        console.error('Cluster API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
