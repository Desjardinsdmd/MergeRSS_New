import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { invokeErrorMessage } from './sourceApi';

/**
 * Client for the `workspace` backend function. Team data is never read from entities
 * directly (Workspace / WorkspaceMember are admin-only); every call goes through here.
 * Throws an Error with a readable message on failure.
 */
export async function workspaceCall(action, params = {}) {
  try {
    const res = await base44.functions.invoke('workspace', { action, ...params });
    const data = res?.data || {};
    if (data.error) throw new Error(data.error);
    return data;
  } catch (err) {
    throw new Error(invokeErrorMessage(err, 'Team request failed'));
  }
}

export const WORKSPACE_KEY = ['workspace-mine'];

/** Caller's workspace, membership, members and pending invites. */
export function useWorkspace(options = {}) {
  const q = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: () => workspaceCall('get_mine'),
    staleTime: 60_000,
    retry: 1,
    ...options,
  });
  const data = q.data || {};
  const role = data.membership?.role || null;
  return {
    ...q,
    workspace: data.workspace || null,
    membership: data.membership || null,
    members: data.members || [],
    invites: data.invites || [],
    role,
    canManage: role === 'owner' || role === 'editor',
    isOwner: role === 'owner',
  };
}
