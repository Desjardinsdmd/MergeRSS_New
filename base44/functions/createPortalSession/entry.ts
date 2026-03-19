import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.0.0';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));
        const body = await req.json().catch(() => ({}));
        const { return_url } = body;

        const subs = await base44.asServiceRole.entities.Subscription.filter({
            $or: [
                { created_by: user.email },
                { user_id: user.id }
            ]
        });

        if (!subs.length || !subs[0].stripe_customer_id) {
            return Response.json({ error: 'No active subscription found' }, { status: 404 });
        }

        // Use env-configured canonical origin; never trust caller-supplied origin header
        const APP_ORIGIN = Deno.env.get('BASE44_APP_URL') || 'https://mergerss.app';

        function isSafeAppUrl(url) {
            if (!url) return false;
            try { return new URL(url).origin === APP_ORIGIN; } catch { return false; }
        }

        if (return_url && !isSafeAppUrl(return_url)) {
            return Response.json({ error: 'Invalid return_url' }, { status: 400 });
        }

        const session = await stripe.billingPortal.sessions.create({
            customer: subs[0].stripe_customer_id,
            return_url: return_url || `${APP_ORIGIN}/Settings`,
        });

        return Response.json({ url: session.url });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});