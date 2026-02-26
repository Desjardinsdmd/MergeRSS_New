import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Stripe from 'npm:stripe@17.0.0';

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

        if (event.type === 'checkout.session.completed') {
            const session = event.data.object;
            const userId = session.metadata?.user_id;

            if (userId) {
                await base44.asServiceRole.entities.User.update(userId, { plan: 'premium' });
            }

            await base44.asServiceRole.entities.Subscription.create({
                stripe_customer_id: session.customer,
                stripe_subscription_id: session.subscription,
                plan: 'premium',
                status: 'active',
                current_period_start: new Date().toISOString(),
                current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            });
        }

        if (event.type === 'customer.subscription.deleted') {
            const subscription = event.data.object;
            const subs = await base44.asServiceRole.entities.Subscription.filter({
                stripe_subscription_id: subscription.id
            });
            if (subs.length > 0) {
                await base44.asServiceRole.entities.Subscription.update(subs[0].id, {
                    status: 'canceled',
                    plan: 'free',
                });
                if (subs[0].user_id) {
                    await base44.asServiceRole.entities.User.update(subs[0].user_id, { plan: 'free' });
                }
            }
        }

        return Response.json({ received: true });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 400 });
    }
});