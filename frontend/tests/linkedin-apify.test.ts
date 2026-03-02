/**
 * Integration test for the Apify LinkedIn scraping + OpenAI persona generation pipeline.
 * Uses dev_fusion/linkedin-profile-scraper actor.
 *
 * Reads APIFY_API_TOKEN and OPENAI_API_KEY from frontend/.env.local
 * Hits real APIs — takes 5-60s depending on Apify cold start.
 *
 * Run:  cd frontend && npx tsx tests/linkedin-apify.test.ts
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load env vars from .env.local ──────────────────────────
const envPath = resolve(__dirname, '..', '.env.local');
const envFile = readFileSync(envPath, 'utf-8');
for (const line of envFile.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx);
    const val = trimmed.slice(eqIdx + 1);
    if (!process.env[key]) process.env[key] = val;
}

const APIFY_TOKEN = process.env.APIFY_API_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const APIFY_BASE = 'https://api.apify.com/v2';
const LINKEDIN_URL = 'https://www.linkedin.com/in/rrklotins/';

// ── Helpers ────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
    if (condition) {
        console.log(`  ✓ ${msg}`);
        passed++;
    } else {
        console.error(`  ✗ ${msg}`);
        failed++;
    }
}

// ── Main ───────────────────────────────────────────────────
async function main() {
    console.log('\n=== LinkedIn Apify Integration Test (dev_fusion actor) ===\n');
    console.log(`  Target: ${LINKEDIN_URL}\n`);

    // Check env vars
    assert(!!APIFY_TOKEN, 'APIFY_API_TOKEN is set');
    assert(!!OPENAI_API_KEY, 'OPENAI_API_KEY is set');
    if (!APIFY_TOKEN || !OPENAI_API_KEY) {
        console.error('\nMissing env vars — aborting.');
        process.exit(1);
    }

    // ── Step 1: Start Apify actor run ──────────────────────
    console.log('\n[1/4] Starting Apify actor run...');
    const runRes = await fetch(
        `${APIFY_BASE}/acts/dev_fusion~linkedin-profile-scraper/runs?token=${APIFY_TOKEN}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileUrls: [LINKEDIN_URL] }),
        },
    );

    assert(runRes.ok, `Actor run started (HTTP ${runRes.status})`);
    const runData = await runRes.json();
    const runId = runData.data?.id;
    const datasetId = runData.data?.defaultDatasetId;
    assert(!!runId, `Got run ID: ${runId}`);
    assert(!!datasetId, `Got dataset ID: ${datasetId}`);

    // ── Step 2: Poll for completion ────────────────────────
    console.log('\n[2/4] Polling for run completion (up to 120s)...');
    let status = runData.data?.status;
    const startTime = Date.now();
    for (let i = 0; i < 60 && status !== 'SUCCEEDED' && status !== 'FAILED' && status !== 'ABORTED'; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const pollRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${APIFY_TOKEN}`);
        const pollData = await pollRes.json();
        status = pollData.data?.status;
        if (i % 5 === 4) console.log(`       ... status: ${status} (${Math.round((Date.now() - startTime) / 1000)}s)`);
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    assert(status === 'SUCCEEDED', `Run completed with status: ${status} (${elapsed}s)`);

    if (status !== 'SUCCEEDED') {
        console.error('\nApify run did not succeed — aborting.');
        process.exit(1);
    }

    // ── Step 3: Fetch dataset & validate profile ───────────
    console.log('\n[3/4] Fetching dataset items...');
    const itemsRes = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${APIFY_TOKEN}`);
    assert(itemsRes.ok, `Dataset fetch OK (HTTP ${itemsRes.status})`);
    const items = await itemsRes.json();
    assert(Array.isArray(items) && items.length > 0, `Got ${items.length} item(s)`);

    const profile = items[0];
    assert(!!profile.fullName, `fullName: "${profile.fullName}"`);
    assert(typeof profile.headline === 'string', `headline: "${profile.headline}"`);
    assert(Array.isArray(profile.experiences), `experiences: ${(profile.experiences || []).length} entries`);
    assert(Array.isArray(profile.educations), `educations: ${(profile.educations || []).length} entries`);

    console.log('\n  Raw profile fields:');
    console.log(`    fullName:    ${profile.fullName}`);
    console.log(`    headline:    ${profile.headline}`);
    console.log(`    about:       ${(profile.about || '(none)').slice(0, 120)}`);
    console.log(`    location:    ${profile.addressCountryOnly}`);
    console.log(`    experiences: ${(profile.experiences || []).length} entries`);
    console.log(`    educations:  ${(profile.educations || []).length} entries`);

    // ── Step 4: Build summary & call OpenAI ────────────────
    console.log('\n[4/4] Generating persona via OpenAI...');
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

    console.log('\n  Profile summary sent to OpenAI:');
    console.log(`    ${summary.replace(/\n/g, '\n    ')}`);

    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

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
    assert(!!content, 'OpenAI returned content');

    const parsed = JSON.parse(content || '{}');
    const name = (parsed.name || '').slice(0, 50);
    const persona = (parsed.persona || '').slice(0, 500);

    assert(name.length > 0, `Generated name: "${name}"`);
    assert(name.toLowerCase().includes('rihards') || name.toLowerCase().includes('kloti'), `Name matches profile (contains first or last name)`);
    assert(persona.length > 0, `Generated persona (${persona.length} chars)`);
    assert(name.length <= 50, `Name within 50 char limit (${name.length})`);
    assert(persona.length <= 500, `Persona within 500 char limit (${persona.length})`);

    console.log('\n  Final output:');
    console.log(`    name:    "${name}"`);
    console.log(`    persona: "${persona}"`);

    // ── Summary ────────────────────────────────────────────
    console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
});
