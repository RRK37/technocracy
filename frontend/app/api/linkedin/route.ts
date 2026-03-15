import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseAdmin } from '@/src/lib/supabase-server';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const APIFY_BASE = 'https://api.apify.com/v2';

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Check + reserve LinkedIn quota before making any external calls
        const month = new Date().toISOString().slice(0, 7);
        const { data: quotaData, error: quotaError } = await supabaseAdmin.rpc('check_and_increment_usage', {
            p_user_id:   user.id,
            p_month:     month,
            p_questions: 0,
            p_linkedin:  1,
        });

        if (quotaError) {
            console.error('LinkedIn quota check error:', quotaError);
            return NextResponse.json({ error: 'Failed to check quota' }, { status: 500 });
        }

        if (!quotaData.ok) {
            return NextResponse.json(quotaData, { status: 402 });
        }

        const { linkedinUrl } = await req.json();

        if (!linkedinUrl || !linkedinUrl.includes('linkedin.com/in/')) {
            return NextResponse.json(
                { error: 'Invalid LinkedIn URL. Must contain linkedin.com/in/' },
                { status: 400 },
            );
        }

        // Start Apify actor run via REST API (dev_fusion scraper)
        const runRes = await fetch(
            `${APIFY_BASE}/acts/dev_fusion~linkedin-profile-scraper/runs?token=${APIFY_TOKEN}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ profileUrls: [linkedinUrl] }),
            },
        );

        if (!runRes.ok) {
            const err = await runRes.text();
            console.error('Apify run start failed:', err);
            return NextResponse.json(
                { error: 'Failed to start LinkedIn scraper' },
                { status: 500 },
            );
        }

        const runData = await runRes.json();
        const runId = runData.data?.id;

        if (!runId) {
            return NextResponse.json(
                { error: 'Failed to start LinkedIn scraper — no run ID' },
                { status: 500 },
            );
        }

        // Poll for run completion (up to 120s)
        let status = runData.data?.status;
        for (let i = 0; i < 60 && status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'ABORTED'; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const pollRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
            const pollData = await pollRes.json();
            status = pollData.data?.status;
        }

        if (status !== 'SUCCEEDED') {
            return NextResponse.json(
                { error: `LinkedIn scraper ${status === 'FAILED' ? 'failed' : 'timed out'}` },
                { status: 422 },
            );
        }

        // Fetch dataset items
        const datasetId = runData.data?.defaultDatasetId;
        const itemsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}`);
        const items = await itemsRes.json();
        const profile = items[0];

        if (!profile || !profile.fullName) {
            return NextResponse.json(
                { error: 'Could not retrieve profile data from LinkedIn' },
                { status: 422 },
            );
        }

        // Build compact summary from dev_fusion response fields:
        //   fullName, headline, about, experiences[].title/companyName/jobDescription, educations[].title/subtitle
        const experiences = (profile.experiences || []).slice(0, 3);
        const educations = (profile.educations || []).slice(0, 2);

        const experienceText = experiences
            .map((e: Record<string, string>) => {
                const parts = [e.title, e.companyName].filter(Boolean).join(' at ');
                return e.jobDescription ? `${parts} (${e.jobDescription})` : parts;
            })
            .filter(Boolean)
            .join('; ');

        const educationText = educations
            .map((e: Record<string, string>) => [e.subtitle, e.title].filter(Boolean).join(' from '))
            .filter(Boolean)
            .join('; ');

        const summary = [
            `Name: ${profile.fullName}`,
            profile.headline ? `Headline: ${profile.headline}` : '',
            profile.about ? `About: ${profile.about}` : '',
            experienceText ? `Experience: ${experienceText}` : '',
            educationText ? `Education: ${educationText}` : '',
            profile.addressCountryOnly ? `Location: ${profile.addressCountryOnly}` : '',
        ].filter(Boolean).join('\n');

        // Generate name + persona via OpenAI
        const response = await openai.chat.completions.create({
            model: 'gpt-4.1-nano',
            messages: [{
                role: 'system',
                content: `You are given a LinkedIn profile summary. Generate a JSON object with two fields:
- "name": The person's full name (max 50 characters)
- "persona": A vivid 2-4 sentence character description capturing their professional identity, expertise, worldview, and communication style. Write it as a character brief for a simulation, in third person. (max 500 characters)

Respond ONLY with valid JSON, no markdown.

Profile:
${summary}`,
            }],
            max_tokens: 300,
            temperature: 0.7,
            response_format: { type: 'json_object' },
        });

        const content = response.choices[0].message.content;
        const parsed = JSON.parse(content || '{}');

        return NextResponse.json({
            name: (parsed.name || profile.fullName || '').slice(0, 50),
            persona: (parsed.persona || '').slice(0, 500),
        });
    } catch (error: unknown) {
        console.error('LinkedIn import error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to import LinkedIn profile' },
            { status: 500 },
        );
    }
}
