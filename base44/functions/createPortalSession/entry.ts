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
            for (const e of new Set([user.email, email])) {
                const customers = await stripe.customers.list({ email: e, limit: 1 });
                customerId = customers.data[0]?.id || null;
                if (customerId) break;
            }
        }

        if (!customerId) {
            return Response.json({
                error: 'No Stripe billing account is linked to this login. If your plan was granted manually there is nothing to manage.',
                code: 'no_billing_account',
            }, { status: 404 });
        }

        // Use env-configured canonical origin; never trust caller-supplied origin header
        const APP_ORIGIN = (() => {
            try { return new URL(Deno.env.get('BASE44_APP_URL') || 'https://mergerss.com').origin; }
            catch { return 'https://mergerss.com'; }
        })();
        const ALLOWED_ORIGINS = new Set([
            APP_ORIGIN,
            APP_ORIGIN.replace('://www.', '://'),
            APP_ORIGIN.includes('://www.') ? APP_ORIGIN : APP_ORIGIN.replace('://', '://www.'),
        ]);

        function isSafeAppUrl(url) {
            if (!url) return false;
            try { return ALLOWED_ORIGINS.has(new URL(url).origin); } catch { return false; }
        }

        // An off-domain return_url (e.g. the builder preview) falls back to Settings instead of failing.
        const safeReturn = return_url && isSafeAppUrl(return_url) ? return_url : `${APP_ORIGIN}/Settings`;

        const session = await stripe.billingPortal.sessions.create({
            customer: customerId,
            return_url: safeReturn,
        });

        return Response.json({ url: session.url });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});