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

// Team plan: billed per workspace, not per user. Members' personal plans are unchanged.
// Mirrors the server rule in base44/functions/workspace/entry.ts (the server enforces it):
//   - workspace.plan === 'team': up to `seats` members (owner included); shared briefings
//     also post to the team Slack / Discord / Teams webhooks.
//   - no active Team plan (trial): the owner plus ONE invited member (`trialSeats`);
//     shared briefings deliver by web and email only.
export const TEAM_PLAN = {
  priceMonthly: 20,
  seats: 5,
  trialSeats: 2,
};

export const TEAM_ROLES = {
  owner: { label: 'Owner', description: 'Billing, members, team channels, plus everything editors can do' },
  editor: { label: 'Editor', description: 'Share and unshare sources, create and edit shared briefings' },
  viewer: { label: 'Viewer', description: 'Reads shared sources and receives shared briefings' },
};

export function teamSeatLimit(workspace) {
  if (!workspace) return TEAM_PLAN.trialSeats;
  return workspace.plan === 'team' ? (workspace.seat_limit || TEAM_PLAN.seats) : TEAM_PLAN.trialSeats;
}

export function canManageTeamContent(role) {
  return role === 'owner' || role === 'editor';
}
