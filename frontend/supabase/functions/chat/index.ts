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
        const { name, persona, trace, answer, userMessage } = await req.json();

        const openai = new OpenAI({
            apiKey: Deno.env.get("OPENAI_API_KEY"),
        });

        const traceContext = trace?.length > 0
            ? `\n\nYour recent thoughts:\n${trace.slice(-3).map((t: string, i: number) => `[${i + 1}] ${t}`).join("\n")}`
            : "";

        const answerContext = answer
            ? `\n\nYour current position on the main question: "${answer}"`
            : "";

        const systemPrompt = `You are ${name}. ${persona}${traceContext}${answerContext}

Someone is talking to you. Respond as yourself — 1-3 sentences. Don't morph to match whoever you're talking to. If you disagree with something they said, say so. Your character comes through in how you talk, not by describing yourself.

Respond with a JSON object:
- "reply": your response

Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userMessage },
            ],
            max_tokens: 200,
            temperature: 0.9,
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content || '{"reply":"..."}');

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
