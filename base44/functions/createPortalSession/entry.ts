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

        // Billing records live in BillingSubscription (never the Source `Subscription` entity).
        const email = (user.email || '').trim().toLowerCase();
        let customerId = null;
        const BS = base44.asServiceRole.entities.BillingSubscription;
        let rows = await BS.filter({ user_email: email });
        if (!rows.length && user.id) rows = await BS.filter({ user_id: user.id });
        customerId = rows.find(r => r.stripe_customer_id)?.stripe_customer_id || null;

        // Fallback: look the customer up in Stripe by email.
        if (!customerId && email) {
            const customers = await stripe.customers.list({ email, limit: 1 });
            customerId = customers.data[0]?.id || null;
        }

        if (!customerId) {
            return Response.json({ error: 'No billing account found' }, { status: 404 });
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
            customer: customerId,
            return_url: return_url || `${APP_ORIGIN}/Settings`,
        });

        return Response.json({ url: session.url });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});