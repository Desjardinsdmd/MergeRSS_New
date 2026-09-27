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

        // Reuse the user's existing Stripe customer (from BillingSubscription) to avoid duplicates.
        let existingCustomerId = null;
        try {
            const rows = await base44.asServiceRole.entities.BillingSubscription.filter({
                user_email: (user.email || '').trim().toLowerCase()
            });
            existingCustomerId = rows.find(r => r.stripe_customer_id)?.stripe_customer_id || null;
        } catch (e) {
            console.log(`[Checkout] BillingSubscription lookup failed: ${e.message}`);
        }

        // Team plan: { plan: 'team', workspace_id }. Only the workspace's active owner can buy it;
        // the workspace id from the client is checked against the caller's own membership.
        // stripeWebhook routes subscriptions with metadata.plan === 'team' to Workspace.plan and
        // never touches the owner's personal User.plan / BillingSubscription.
        if (body.plan === 'team') {
            const svc = base44.asServiceRole.entities;
            const wsId = String(body.workspace_id || '');
            const ws = wsId ? await svc.Workspace.get(wsId).catch(() => null) : null;
            const me = (user.email || '').trim().toLowerCase();
            const own = ws ? (await svc.WorkspaceMember.filter({ workspace_id: ws.id, user_email: me, status: 'active' }))
                .find(m => m.role === 'owner') : null;
            if (!ws || ws.status === 'deleted' || !own) {
                return Response.json({ error: 'Only the workspace owner can upgrade it to Team' }, { status: 403 });
            }
            if (ws.plan === 'team') {
                return Response.json({ error: 'This workspace is already on the Team plan' }, { status: 409 });
            }
            const teamPrice = Deno.env.get('STRIPE_TEAM_PRICE_ID');
            if (!teamPrice) return Response.json({ error: 'Team plan is not configured yet' }, { status: 503 });
            const meta = { plan: 'team', workspace_id: ws.id, user_id: user.id, user_email: user.email };
            const teamSession = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{ price: teamPrice, quantity: 1 }],
                mode: 'subscription',
                success_url: success_url || `${APP_ORIGIN}${createPageUrl('Team')}?payment=success`,
                cancel_url: cancel_url || `${APP_ORIGIN}${createPageUrl('Team')}`,
                ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: user.email }),
                metadata: meta,
                subscription_data: { metadata: meta },
            });
            return Response.json({ url: teamSession.url });
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
            ...(existingCustomerId ? { customer: existingCustomerId } : { customer_email: user.email }),
            metadata: {
                user_id: user.id,
                user_email: user.email,
            },
            subscription_data: {
                metadata: {
                    user_id: user.id,
                    user_email: user.email,
                },
            },
        });

        return Response.json({ url: session.url });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});