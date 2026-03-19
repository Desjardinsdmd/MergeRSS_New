import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import Stripe from 'npm:stripe@17.0.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { email } = await req.json();

    if (!email) {
      return Response.json({ error: 'Email required' }, { status: 400 });
    }

    // Find Stripe customer
    const customers = await stripe.customers.list({ email, limit: 1 });

    if (!customers.data.length) {
      return Response.json({ 
        email,
        stripe_customer_id: null,
        message: 'No Stripe customer found'
      });
    }

    const customer = customers.data[0];

    // Get subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      limit: 10
    });

    const activeSubscription = subscriptions.data.find(s => s.status === 'active');

    return Response.json({
      email,
      stripe_customer_id: customer.id,
      stripe_customer_name: customer.name,
      subscriptions_count: subscriptions.data.length,
      stripe_subscription_id: activeSubscription?.id || null,
      subscription_status: activeSubscription?.status || 'no active subscription',
      subscription_period_end: activeSubscription?.current_period_end || null,
      all_subscriptions: subscriptions.data.map(s => ({
        id: s.id,
        status: s.status,
        created: s.created,
        current_period_end: s.current_period_end
      }))
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});