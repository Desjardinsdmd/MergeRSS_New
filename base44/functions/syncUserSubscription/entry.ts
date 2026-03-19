import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import Stripe from 'npm:stripe@17.0.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Find Stripe customer by email
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    
    if (!customers.data.length) {
      return Response.json({ 
        message: 'No Stripe customer found for this email',
        email: user.email,
        plan: user.plan
      });
    }

    const customer = customers.data[0];

    // Get active subscriptions
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    });

    if (!subscriptions.data.length) {
      return Response.json({ 
        message: 'No active subscriptions found',
        email: user.email,
        plan: user.plan
      });
    }

    const subscription = subscriptions.data[0];
    
    // Update user plan to premium if not already
    if (user.plan !== 'premium') {
      await base44.auth.updateMe({ plan: 'premium' });
      return Response.json({ 
        success: true,
        message: 'User plan updated to premium',
        email: user.email,
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status
      });
    }

    return Response.json({ 
      message: 'User already premium',
      email: user.email,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});