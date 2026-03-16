import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.0.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { success_url, cancel_url } = body;

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

        const origin = req.headers.get('origin') || 'https://mergerss.app';
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: Deno.env.get('STRIPE_PREMIUM_PRICE_ID'),
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: success_url || `${origin}${createPageUrl('Pricing')}?payment=success`,
            cancel_url: cancel_url || `${origin}${createPageUrl('Pricing')}`,
            customer_email: user.email,
            metadata: {
                user_id: user.id,
                user_email: user.email,
            },
        });

        return Response.json({ url: session.url });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});