import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import OpenAI from "https://esm.sh/openai@4.72.0";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
        return new Response("ok", { headers: corsHeaders });
    }

    try {
        const { answers, question } = await req.json();

        const openai = new OpenAI({
            apiKey: Deno.env.get("OPENAI_API_KEY"),
        });

        const answerList = answers
            .map((a: { agentId: string; answer: string }) => `- ${a.answer}`)
            .join("\n");

        const systemPrompt = `You are analyzing crowd responses to the question: "${question}"

Here are all the individual answers:
${answerList}

Group these answers into common themes. For each theme, provide a short label and count how many answers fit that theme. An answer can fit into multiple themes if appropriate.

If the question is a yes/no question, make sure "Yes" and "No" are themes.

Respond with a JSON object:
{
  "themes": [
    { "label": "Theme name", "count": number, "agentIds": [], "sentiment": "positive" | "negative" | "neutral" }
  ]
}

Keep theme labels concise (2-5 words). Order by count descending. Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }],
            max_tokens: 500,
            temperature: 0.3,
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content || '{"themes":[]}');

        return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
    }
});
