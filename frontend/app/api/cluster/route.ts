import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const MAX_QUESTION_LEN = 500;
const MAX_ANSWERS = 150;
const MAX_ANSWER_LEN = 500;
const MAX_AGENT_ID_LEN = 50;

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
            model: 'gpt-4.1-nano',
            messages: [{ role: 'system', content: systemPrompt }],
            max_tokens: 2000,
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
