import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.0.0';

function createPageUrl(page) {
    return `/${page}`;
}

Deno.serve(async (req) => {
    try {
        let base44;
        try {
            base44 = createClientFromRequest(req);
        } catch {
            const { createClient } = await import('npm:@base44/sdk@0.8.20');
            base44 = createClient();
        }
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await req.json().catch(() => ({}));
        const { success_url, cancel_url } = body;

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

        // Use env-configured canonical origin; never trust caller-supplied origin header
        const APP_ORIGIN = Deno.env.get('BASE44_APP_URL') || 'https://mergerss.app';

        function isSafeAppUrl(url) {
            if (!url) return false;
            try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
        }

        if (success_url && !isSafeAppUrl(success_url)) {
            return Response.json({ error: 'Invalid success_url' }, { status: 400 });
        }
        if (cancel_url && !isSafeAppUrl(cancel_url)) {
            return Response.json({ error: 'Invalid cancel_url' }, { status: 400 });
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: Deno.env.get('STRIPE_PREMIUM_PRICE_ID'),
                quantity: 1,
            }],
            mode: 'subscription',
            success_url: success_url || `${APP_ORIGIN}${createPageUrl('Pricing')}?payment=success`,
            cancel_url: cancel_url || `${APP_ORIGIN}${createPageUrl('Pricing')}`,
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