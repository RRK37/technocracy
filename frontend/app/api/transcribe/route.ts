import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const audio = formData.get('audio') as File | null;

        if (!audio) {
            return NextResponse.json(
                { error: 'No audio file provided' },
                { status: 400 },
            );
        }

        const transcription = await openai.audio.transcriptions.create({
            model: 'whisper-1',
            file: audio,
        });

        return NextResponse.json({ text: transcription.text });
    } catch (error: unknown) {
        console.error('Transcribe API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
