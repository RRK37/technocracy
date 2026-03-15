import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/src/lib/supabase-server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Disable body parsing — Stripe requires the raw body for signature verification
export const config = { api: { bodyParser: false } };

export async function POST(req: NextRequest) {
    const sig = req.headers.get('stripe-signature');
    if (!sig) return NextResponse.json({ error: 'No signature' }, { status: 400 });

    let event: Stripe.Event;
    try {
        const rawBody = await req.text();
        event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err) {
        console.error('Webhook signature failed:', err);
        return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;

        const userId  = session.client_reference_id;
        const credits = Number(session.metadata?.credits);

        if (!userId || !credits) {
            console.error('Webhook: missing userId or credits', { userId, credits });
            return NextResponse.json({ error: 'Missing data' }, { status: 400 });
        }

        const { error } = await supabaseAdmin.rpc('add_credits', {
            p_user_id: userId,
            p_credits: credits,
        });

        if (error) {
            console.error('Failed to add credits:', error);
            return NextResponse.json({ error: 'Failed to add credits' }, { status: 500 });
        }

        console.log(`Added ${credits} credits to user ${userId}`);
    }

    return NextResponse.json({ received: true });
}
