// Public price and plan facts shared by the marketing pages (Landing, Pricing, SEO).
// Limits come from src/lib/planLimits.js; the Premium price is set here because planLimits
// does not carry it. Keep in step with the Stripe price used by createCheckoutSession.
import * as planLimits from '@/lib/planLimits';

const LIMITS = planLimits?.PLAN_LIMITS || {};
const TEAM = planLimits?.TEAM_PLAN || {};

export const PREMIUM_PRICE = 5;
export const FREE_SOURCES = Number.isFinite(LIMITS?.free?.feeds) ? LIMITS.free.feeds : 50;
export const FREE_BRIEFINGS = Number.isFinite(LIMITS?.free?.digests) ? LIMITS.free.digests : 5;
export const TEAM_MEMBERS = Number.isFinite(TEAM?.seats) ? TEAM.seats : 5;
export const TEAM_TRIAL_SEATS = Number.isFinite(TEAM?.trialSeats) ? TEAM.trialSeats : 2;
export const TEAM_PRICE = Number.isFinite(TEAM?.priceMonthly) ? TEAM.priceMonthly : 20;
