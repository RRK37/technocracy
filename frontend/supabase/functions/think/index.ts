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
        const { name, persona, trace, question } = await req.json();

        const openai = new OpenAI({
            apiKey: Deno.env.get("OPENAI_API_KEY"),
        });

        const traceContext = trace.length > 0
            ? `\n\nYour previous thoughts and experiences:\n${trace.map((t: string, i: number) => `[${i + 1}] ${t}`).join("\n")}`
            : "";

        const systemPrompt = `You are ${name}. ${persona}

You are a citizen in a deliberation. Someone has asked the community a question. Think about it carefully from your unique perspective.${traceContext}

The question is: "${question}"

Respond with a JSON object containing:
- "reasoning": Your internal thought process (2-4 sentences of pondering/reasoning from your character's perspective)
- "answer": Your concise answer to the question (1-3 sentences, clear position)

Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }],
            max_tokens: 300,
            temperature: 0.9,
            response_format: { type: "json_object" },
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content || "{}");

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
