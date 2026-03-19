import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import Stripe from 'npm:stripe@17.0.0';

async function resolveUserId(base44, stripe, session) {
    // First try metadata (preferred)
    if (session.metadata?.user_id) {
        console.log(`[Stripe] User resolved from metadata: ${session.metadata.user_id}`);
        return session.metadata.user_id;
    }

    // Fallback: lookup by email
    if (session.customer_email) {
        const users = await base44.asServiceRole.entities.User.filter({
            email: session.customer_email
        });
        if (users.length > 0) {
            console.log(`[Stripe] User resolved by email (${session.customer_email}): ${users[0].id}`);
            return users[0].id;
        }
    }

    // Last resort: lookup Stripe customer to get email
    if (session.customer) {
        const customer = await stripe.customers.retrieve(session.customer);
        if (customer.email) {
            const users = await base44.asServiceRole.entities.User.filter({
                email: customer.email
            });
            if (users.length > 0) {
                console.log(`[Stripe] User resolved via Stripe customer email (${customer.email}): ${users[0].id}`);
                return users[0].id;
            }
        }
    }

    console.log(`[Stripe] WARNING: Could not resolve user. Metadata: ${JSON.stringify(session.metadata)}, Email: ${session.customer_email}`);
    return null;
}

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const body = await req.text();
        const signature = req.headers.get('stripe-signature');

        const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

        const event = await stripe.webhooks.constructEventAsync(
            body,
            signature,
            Deno.env.get('STRIPE_WEBHOOK_SECRET')
        );

        console.log(`[Stripe] Event received: ${event.type}`);

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            console.log(`[Stripe] Checkout completed. Customer: ${session.customer}, Subscription: ${session.subscription}`);

            const userId = await resolveUserId(base44, stripe, session);

            // Idempotency check: ensure we don't create duplicate subscriptions
            const existing = await base44.asServiceRole.entities.Subscription.filter({
                stripe_subscription_id: session.subscription
            });
            if (existing.length > 0) {
                console.log(`[Stripe] Subscription ${session.subscription} already exists, skipping duplicate`);
                return Response.json({ received: true });
            }

            if (userId) {
                const user = await base44.asServiceRole.entities.User.read(userId);
                console.log(`[Stripe] Updating user ${userId} from plan '${user?.plan || 'unknown'}' to 'premium'`);
                await base44.asServiceRole.entities.User.update(userId, { plan: 'premium' });
                console.log(`[Stripe] User ${userId} plan updated to premium`);
            } else {
                console.log(`[Stripe] ERROR: Could not resolve user for subscription ${session.subscription}`);
            }

            await base44.asServiceRole.entities.Subscription.create({
                stripe_customer_id: session.customer,
                stripe_subscription_id: session.subscription,
                user_id: userId,
                plan: 'premium',
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
            console.log(`[Stripe] Subscription record created for ${session.subscription}`);
        }

        if (event.type === 'customer.subscription.created') {
            const subscription = event.data.object;
            console.log(`[Stripe] Subscription created: ${subscription.id}, Status: ${subscription.status}`);

            // Check if subscription already exists (idempotency)
            const existing = await base44.asServiceRole.entities.Subscription.filter({
                stripe_subscription_id: subscription.id
            });
            if (existing.length > 0) {
                console.log(`[Stripe] Subscription ${subscription.id} already in DB, skipping`);
                return Response.json({ received: true });
            }

            // Retrieve customer to find user by email
            const customer = await stripe.customers.retrieve(subscription.customer);
            let userId = null;
            if (customer.email) {
                const users = await base44.asServiceRole.entities.User.filter({
                    email: customer.email
                });
                if (users.length > 0) {
                    userId = users[0].id;
                    console.log(`[Stripe] Resolved user ${userId} from customer email ${customer.email}`);
                }
            }

            const isPremium = subscription.status === 'active' || subscription.status === 'trialing';

            await base44.asServiceRole.entities.Subscription.create({
                stripe_customer_id: subscription.customer,
                stripe_subscription_id: subscription.id,
                user_id: userId,
                plan: isPremium ? 'premium' : 'free',
                status: subscription.status,
                current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                cancel_at_period_end: subscription.cancel_at_period_end || false,
            });

            if (userId) {
                const user = await base44.asServiceRole.entities.User.read(userId);
                console.log(`[Stripe] Updating user ${userId} plan from '${user?.plan || 'unknown'}' to '${isPremium ? 'premium' : 'free'}'`);
                await base44.asServiceRole.entities.User.update(userId, { plan: isPremium ? 'premium' : 'free' });
            } else {
                console.log(`[Stripe] WARNING: Could not resolve user for subscription ${subscription.id}`);
            }
        }

        if (event.type === 'customer.subscription.updated') {
            const subscription = event.data.object;
            console.log(`[Stripe] Subscription updated: ${subscription.id}, Status: ${subscription.status}`);

            const subs = await base44.asServiceRole.entities.Subscription.filter({
                stripe_subscription_id: subscription.id
            });
            if (subs.length > 0) {
                const sub = subs[0];
                const newStatus = subscription.status; // active, past_due, canceled, trialing, etc.
                const isPremium = newStatus === 'active' || newStatus === 'trialing';
                const oldPlan = sub.plan;

                await base44.asServiceRole.entities.Subscription.update(sub.id, {
                    status: newStatus,
                    plan: isPremium ? 'premium' : 'free',
                    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
                    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                    cancel_at_period_end: subscription.cancel_at_period_end || false,
                });
                console.log(`[Stripe] Subscription ${subscription.id} updated: ${oldPlan} → ${isPremium ? 'premium' : 'free'}`);

                if (sub.user_id) {
                    const user = await base44.asServiceRole.entities.User.read(sub.user_id);
                    const oldUserPlan = user?.plan;
                    await base44.asServiceRole.entities.User.update(sub.user_id, { plan: isPremium ? 'premium' : 'free' });
                    console.log(`[Stripe] User ${sub.user_id} plan updated: ${oldUserPlan} → ${isPremium ? 'premium' : 'free'}`);
                } else {
                    console.log(`[Stripe] WARNING: Subscription ${subscription.id} has no user_id, skipping user plan update`);
                }
            } else {
                console.log(`[Stripe] WARNING: Subscription ${subscription.id} not found in DB`);
            }
        }

        if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            console.log(`[Stripe] Subscription deleted: ${subscription.id}`);

            const subs = await base44.asServiceRole.entities.Subscription.filter({
                stripe_subscription_id: subscription.id
            });
            if (subs.length > 0) {
                const sub = subs[0];
                const oldPlan = sub.plan;
                await base44.asServiceRole.entities.Subscription.update(sub.id, {
                    status: 'canceled',
                    plan: 'free',
                });
                console.log(`[Stripe] Subscription ${subscription.id} marked as canceled`);

                if (sub.user_id) {
                    const user = await base44.asServiceRole.entities.User.read(sub.user_id);
                    const oldUserPlan = user?.plan;
                    await base44.asServiceRole.entities.User.update(sub.user_id, { plan: 'free' });
                    console.log(`[Stripe] User ${sub.user_id} plan reverted: ${oldUserPlan} → free`);
                } else {
                    console.log(`[Stripe] WARNING: Subscription ${subscription.id} has no user_id`);
                }
            } else {
                console.log(`[Stripe] WARNING: Subscription ${subscription.id} not found in DB`);
            }
        }

        console.log(`[Stripe] Event ${event.type} processed successfully`);
        return Response.json({ received: true });
    } catch (error) {
        console.error(`[Stripe] Error processing event: ${error.message}`);
        return Response.json({ error: error.message }, { status: 400 });
    }
});