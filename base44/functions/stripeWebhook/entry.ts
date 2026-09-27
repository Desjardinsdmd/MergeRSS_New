import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.0.0';

// Billing records live in the BillingSubscription entity.
// NOTE: the `Subscription` entity is the user->Source subscription model and must never
// be written to from here.

const PREMIUM_STATUSES = new Set(['active', 'trialing', 'past_due']);
const FREE_STATUSES = new Set(['canceled', 'unpaid', 'incomplete_expired', 'incomplete', 'paused']);

// active/trialing -> premium; past_due keeps premium (status recorded);
// canceled/unpaid/incomplete_expired (and incomplete/paused) -> free.
function planForStatus(status) {
    if (PREMIUM_STATUSES.has(status)) return 'premium';
    if (FREE_STATUSES.has(status)) return 'free';
    return 'free';
}

function periodEndIso(sub) {
    const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
    return ts ? new Date(ts * 1000).toISOString() : undefined;
}

function normEmail(email) {
    return (email || '').trim().toLowerCase() || null;
}

async function findUserByEmail(base44, email) {
    if (!email) return null;
    let users = await base44.asServiceRole.entities.User.filter({ email });
    if (!users.length && email !== email.toLowerCase()) {
        users = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase() });
    }
    return users[0] || null;
}

async function customerEmail(stripe, customerId) {
    if (!customerId) return null;
    try {
        const customer = await stripe.customers.retrieve(customerId);
        if (customer && !customer.deleted) return normEmail(customer.email);
    } catch (e) {
        console.log(`[Stripe] Could not retrieve customer ${customerId}: ${e.message}`);
    }
    return null;
}

async function setUserPlan(base44, { userId, email }, plan) {
    let user = null;
    if (userId) {
        try { user = await base44.asServiceRole.entities.User.get(userId); } catch { user = null; }
    }
    if (!user && email) user = await findUserByEmail(base44, email);
    if (!user) {
        console.log(`[Stripe] WARNING: no user found (id=${userId}, email=${email}) to set plan=${plan}`);
        return null;
    }
    if (user.plan !== plan) {
        await base44.asServiceRole.entities.User.update(user.id, { plan });
        console.log(`[Stripe] User ${user.id} plan ${user.plan || 'unset'} -> ${plan}`);
    }
    return user;
}

async function findBillingBySubOrCustomer(base44, subscriptionId, customerId) {
    const BS = base44.asServiceRole.entities.BillingSubscription;
    if (subscriptionId) {
        const rows = await BS.filter({ stripe_subscription_id: subscriptionId });
        if (rows.length) return { row: rows[0], via: 'subscription' };
    }
    if (customerId) {
        const rows = await BS.filter({ stripe_customer_id: customerId });
        if (rows.length) return { row: rows[0], via: 'customer' };
    }
    return { row: null, via: null };
}

async function upsertBillingByEmail(base44, email, data) {
    const BS = base44.asServiceRole.entities.BillingSubscription;
    const rows = await BS.filter({ user_email: email });
    if (rows.length) {
        await BS.update(rows[0].id, data);
        return rows[0].id;
    }
    const created = await BS.create({ user_email: email, ...data });
    return created?.id;
}

async function handleCheckoutCompleted(base44, stripe, session) {
    if (session.mode && session.mode !== 'subscription') {
        console.log(`[Stripe] Ignoring checkout session ${session.id} with mode=${session.mode}`);
        return;
    }

    // Resolve the user. metadata is set server-side by createCheckoutSession.
    let user = null;
    if (session.metadata?.user_id) {
        try { user = await base44.asServiceRole.entities.User.get(session.metadata.user_id); } catch { user = null; }
    }
    const email = normEmail(
        user?.email ||
        session.metadata?.user_email ||
        session.customer_details?.email ||
        session.customer_email
    ) || await customerEmail(stripe, session.customer);

    if (!user && email) user = await findUserByEmail(base44, email);
    const userEmail = normEmail(user?.email) || email;

    if (!userEmail) {
        console.log(`[Stripe] ERROR: could not resolve email for checkout session ${session.id}`);
        return;
    }

    let status = 'active';
    let periodEnd;
    let cancelAtPeriodEnd = false;
    if (session.subscription) {
        try {
            const sub = await stripe.subscriptions.retrieve(session.subscription);
            status = sub.status;
            periodEnd = periodEndIso(sub);
            cancelAtPeriodEnd = !!sub.cancel_at_period_end;
        } catch (e) {
            console.log(`[Stripe] Could not retrieve subscription ${session.subscription}: ${e.message}`);
        }
    }
    const plan = planForStatus(status);

    const data = {
        stripe_customer_id: session.customer || undefined,
        stripe_subscription_id: session.subscription || undefined,
        status,
        plan,
        cancel_at_period_end: cancelAtPeriodEnd,
    };
    if (user?.id) data.user_id = user.id;
    if (periodEnd) data.current_period_end = periodEnd;

    await upsertBillingByEmail(base44, userEmail, data);
    await setUserPlan(base44, { userId: user?.id, email: userEmail }, plan);
    console.log(`[Stripe] Checkout completed for ${userEmail}: sub=${session.subscription} status=${status} plan=${plan}`);
}

async function handleSubscriptionChange(base44, stripe, subscription, eventType) {
    const status = eventType === 'customer.subscription.deleted' ? 'canceled' : subscription.status;
    const plan = planForStatus(status);
    const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

    const { row, via } = await findBillingBySubOrCustomer(base44, subscription.id, customerId);

    // A customer can have an older subscription ending while a newer one is live.
    // If we only matched by customer and the stored row points at a different, still-live
    // subscription, do not let the old subscription's event downgrade the user.
    if (row && via === 'customer' && row.stripe_subscription_id &&
        row.stripe_subscription_id !== subscription.id &&
        PREMIUM_STATUSES.has(row.status) && plan === 'free') {
        console.log(`[Stripe] Ignoring ${eventType} for ${subscription.id}; customer ${customerId} has live subscription ${row.stripe_subscription_id}`);
        return;
    }

    const data = {
        stripe_customer_id: customerId || undefined,
        stripe_subscription_id: subscription.id,
        status,
        plan,
        cancel_at_period_end: !!subscription.cancel_at_period_end,
    };
    const periodEnd = periodEndIso(subscription);
    if (periodEnd) data.current_period_end = periodEnd;

    if (row) {
        await base44.asServiceRole.entities.BillingSubscription.update(row.id, data);
        await setUserPlan(base44, { userId: row.user_id, email: normEmail(row.user_email) }, plan);
        console.log(`[Stripe] ${eventType}: ${subscription.id} status=${status} plan=${plan} (row ${row.id})`);
        return;
    }

    // No row yet (e.g. subscription events arrived before checkout.session.completed).
    const email = normEmail(subscription.metadata?.user_email) || await customerEmail(stripe, customerId);
    if (!email) {
        console.log(`[Stripe] WARNING: ${eventType} for ${subscription.id}: no billing row and no customer email`);
        return;
    }
    const user = await findUserByEmail(base44, email);
    const userEmail = normEmail(user?.email) || email;
    if (user?.id) data.user_id = user.id;
    await upsertBillingByEmail(base44, userEmail, data);
    await setUserPlan(base44, { userId: user?.id, email: userEmail }, plan);
    console.log(`[Stripe] ${eventType}: created/updated billing row for ${userEmail} status=${status} plan=${plan}`);
}

Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

    let event;
    try {
        const body = await req.text();
        const signature = req.headers.get('stripe-signature');
        event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            Deno.env.get('STRIPE_WEBHOOK_SECRET')
        );
    } catch (error) {
        console.error(`[Stripe] Signature verification failed: ${error.message}`);
        return Response.json({ error: 'Invalid signature' }, { status: 400 });
    }

    try {
        console.log(`[Stripe] Event received: ${event.type} (${event.id})`);

        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(base44, stripe, event.data.object);
                break;
            case 'customer.subscription.created':
            case 'customer.subscription.updated':
            case 'customer.subscription.deleted':
                await handleSubscriptionChange(base44, stripe, event.data.object, event.type);
                break;
            default:
                console.log(`[Stripe] Unhandled event type ${event.type}`);
        }

        return Response.json({ received: true });
    } catch (error) {
        // 500 so Stripe retries transient failures.
        console.error(`[Stripe] Error processing ${event?.type}: ${error.message}`);
        return Response.json({ error: error.message }, { status: 500 });
    }
});
