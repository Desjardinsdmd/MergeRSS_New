// Central plan limits config — update here to change limits everywhere
export const PLAN_LIMITS = {
  free: {
    feeds: 50,
    digests: 5,
  },
  premium: {
    feeds: Infinity,
    digests: Infinity,
  },
};

export function getLimit(isPremium, resource) {
  return isPremium ? PLAN_LIMITS.premium[resource] : PLAN_LIMITS.free[resource];
}