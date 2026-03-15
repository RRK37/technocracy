import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/src/lib/supabase-server';

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

        const body = await req.json().catch(() => ({}));
        const questions: number = typeof body.questions === 'number' ? body.questions : 1;

        const month = new Date().toISOString().slice(0, 7);

        const { data, error } = await supabaseAdmin.rpc('check_and_increment_usage', {
            p_user_id:   user.id,
            p_month:     month,
            p_questions: questions,
            p_linkedin:  0,
        });

        if (error) {
            console.error('check_and_increment_usage error:', error);
            return NextResponse.json({ error: 'Failed to check quota' }, { status: 500 });
        }

        if (!data.ok) {
            return NextResponse.json(data, { status: 402 });
        }

        return NextResponse.json(data);
    } catch (error: unknown) {
        console.error('Deliberation start error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
