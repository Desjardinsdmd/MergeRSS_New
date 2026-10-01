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

        // Team plan: { workspace_id }. Only the workspace's active owner may open its billing portal;
        // the customer id comes from the Workspace record (set by stripeWebhook), never the client.
        if (body.workspace_id) {
            const svc = base44.asServiceRole.entities;
            const wsId = String(body.workspace_id);
            const ws = await svc.Workspace.get(wsId).catch(() => null);
            const me = (user.email || '').trim().toLowerCase();
            const own = ws ? (await svc.WorkspaceMember.filter({ workspace_id: ws.id, user_email: me, status: 'active' }))
                .find(m => m.role === 'owner') : null;
            if (!ws || ws.status === 'deleted' || !own) {
                return Response.json({ error: 'Only the workspace owner can manage Team billing' }, { status: 403 });
            }
            let teamCustomerId = ws.stripe_customer_id || null;
            if (!teamCustomerId && ws.stripe_subscription_id) {
                try {
                    const sub = await stripe.subscriptions.retrieve(ws.stripe_subscription_id);
                    teamCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id || null;
                } catch (e) {
                    console.log(`[Portal] Could not retrieve team subscription ${ws.stripe_subscription_id}: ${e.message}`);
                }
            }
            if (!teamCustomerId) {
                return Response.json({
                    error: 'This workspace has no Stripe billing account to manage.',
                    code: 'no_billing_account',
                }, { status: 404 });
            }
            const teamReturn = return_url && isSafeAppUrl(return_url) ? return_url : `${APP_ORIGIN}/Team`;
            const teamSession = await stripe.billingPortal.sessions.create({
                customer: teamCustomerId,
                return_url: teamReturn,
            });
            return Response.json({ url: teamSession.url });
        }

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