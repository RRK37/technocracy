import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/src/lib/supabase-server';

export async function POST(req: NextRequest) {
    try {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

        const PACKS: Record<string, { priceId: string; credits: number; label: string }> = {
            starter:  { priceId: process.env.STRIPE_PRICE_STARTER!,  credits: 10,  label: '10 questions' },
            standard: { priceId: process.env.STRIPE_PRICE_STANDARD!, credits: 30,  label: '30 questions' },
            pro:      { priceId: process.env.STRIPE_PRICE_PRO!,      credits: 100, label: '100 questions' },
        };

        const authHeader = req.headers.get('authorization');
        const token = authHeader?.replace('Bearer ', '');
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const { pack } = await req.json();
        const selected = PACKS[pack];
        if (!selected) {
            return NextResponse.json({ error: 'Invalid pack' }, { status: 400 });
        }

        const origin = req.headers.get('origin') || 'http://localhost:3000';

        const session = await stripe.checkout.sessions.create({
            mode: 'payment',
            line_items: [{ price: selected.priceId, quantity: 1 }],
            client_reference_id: user.id,
            customer_email: user.email,
            metadata: { credits: selected.credits.toString() },
            success_url: `${origin}/?payment=success`,
            cancel_url:  `${origin}/?payment=cancelled`,
        });

        return NextResponse.json({ url: session.url });
    } catch (error: unknown) {
        console.error('Checkout error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 },
        );
    }
}
