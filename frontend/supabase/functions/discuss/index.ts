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

You are in a group discussion with: ${participantNames}.
The topic is: "${question}"${traceContext}${conversationContext}

Respond naturally as ${currentSpeaker.name}. Share your opinion in 1-3 sentences. Be conversational, not formal. Don't repeat what others have said unless you're responding to it.

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
