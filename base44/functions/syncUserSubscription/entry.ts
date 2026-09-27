import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import Stripe from 'npm:stripe@17.0.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY'));

// Keep in sync with stripeWebhook.
const PREMIUM_STATUSES = new Set(['active', 'trialing', 'past_due']);
const STATUS_PRIORITY = ['active', 'trialing', 'past_due', 'unpaid', 'incomplete', 'paused', 'canceled', 'incomplete_expired'];

function planForStatus(status) {
  return PREMIUM_STATUSES.has(status) ? 'premium' : 'free';
}

function periodEndIso(sub) {
  const ts = sub?.current_period_end ?? sub?.items?.data?.[0]?.current_period_end;
  return ts ? new Date(ts * 1000).toISOString() : undefined;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = (user.email || '').trim().toLowerCase();
    const BS = base44.asServiceRole.entities.BillingSubscription;
    const rows = await BS.filter({ user_email: email });
    const row = rows[0] || null;

    // Find the Stripe customer: stored id first, then by email.
    let customerId = row?.stripe_customer_id || null;
    if (!customerId) {
      for (const e of new Set([user.email, email])) {
        const customers = await stripe.customers.list({ email: e, limit: 1 });
        if (customers.data.length) { customerId = customers.data[0].id; break; }
      }
    }

    if (!customerId) {
      // No Stripe customer: leave the plan untouched (manual grants are preserved).
      return Response.json({
        message: 'No Stripe customer found for this email',
        email: user.email,
        plan: user.plan,
      });
    }

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 20,
    });

    if (!subscriptions.data.length) {
      return Response.json({
        message: 'No subscriptions found for this customer',
        email: user.email,
        plan: user.plan,
      });
    }

    const rank = (s) => {
      const i = STATUS_PRIORITY.indexOf(s.status);
      return i === -1 ? STATUS_PRIORITY.length : i;
    };
    const subscription = [...subscriptions.data].sort((a, b) => rank(a) - rank(b) || b.created - a.created)[0];
    const plan = planForStatus(subscription.status);

    const data = {
      user_id: user.id,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      status: subscription.status,
      plan,
      cancel_at_period_end: !!subscription.cancel_at_period_end,
    };
    const periodEnd = periodEndIso(subscription);
    if (periodEnd) data.current_period_end = periodEnd;

    if (row) {
      await BS.update(row.id, data);
    } else {
      await BS.create({ user_email: email, ...data });
    }

    const previousPlan = user.plan;
    if (previousPlan !== plan) {
      await base44.asServiceRole.entities.User.update(user.id, { plan });
    }

    return Response.json({
      success: true,
      message: previousPlan !== plan ? `User plan updated to ${plan}` : `User plan unchanged (${plan})`,
      email: user.email,
      plan,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
