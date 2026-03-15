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
        const { participants, question, conversationSoFar, currentSpeaker } = await req.json();

        const openai = new OpenAI({
            apiKey: Deno.env.get("OPENAI_API_KEY"),
        });

        const participantNames = participants.map((p: { name: string }) => p.name).join(", ");

        const traceContext = currentSpeaker.trace?.length > 0
            ? `\n\nYour previous thoughts:\n${currentSpeaker.trace.slice(-3).map((t: string, i: number) => `[${i + 1}] ${t}`).join("\n")}`
            : "";

        const conversationContext = conversationSoFar
            ? `\n\nThe conversation so far:\n${conversationSoFar}`
            : "\n\nYou are the first to speak.";

        const systemPrompt = `You are ${currentSpeaker.name}. ${currentSpeaker.persona}

You're in a discussion with ${participantNames} about: "${question}"${traceContext}${conversationContext}

Respond as yourself — 1-3 sentences. If someone said something you disagree with, push back directly. If someone made a weak argument, call it out. Don't soften your real view to keep the peace. Don't narrate your own personality — let your word choice and attitude do that work.

Respond with a JSON object:
- "speaker": "${currentSpeaker.name}"
- "message": your response

Respond ONLY with valid JSON, no markdown.`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: systemPrompt }],
            max_tokens: 200,
            temperature: 1.0,
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
