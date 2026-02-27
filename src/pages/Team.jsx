import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Users, Plus, Loader2, Mail, Shield, Eye, Edit3,
  Trash2, MoreVertical, Crown, Check
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ROLE_META = {
  admin: {
    label: 'Admin',
    icon: Crown,
    color: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    description: 'Full access: manage feeds, digests, team, and settings',
  },
  editor: {
    label: 'Editor',
    icon: Edit3,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    description: 'Can add/edit feeds and digests, cannot manage team',
  },
  viewer: {
    label: 'Viewer',
    icon: Eye,
    color: 'bg-slate-100 text-slate-600 border-slate-200',
    description: 'Read-only access to feeds, digests, and inbox',
  },
};

function RoleBadge({ role }) {
  const meta = ROLE_META[role] || ROLE_META.viewer;
  const Icon = meta.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border', meta.color)}>
      <Icon className="w-3 h-3" />
      {meta.label}
    </span>
  );
}

export default function Team() {
  const [user, setUser] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('viewer');
  const [inviting, setInviting] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    base44.auth.me().then(setUser);
  }, []);

  const { data: members = [], isLoading } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list('-created_date'),
  });

  const isAdmin = user?.role === 'admin';

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      // Create team member record
      await base44.entities.TeamMember.create({
        email: inviteEmail.trim().toLowerCase(),
        role: inviteRole,
        status: 'pending',
        invited_by: user?.email,
      });
      // Invite to the app
      await base44.users.inviteUser(inviteEmail.trim(), inviteRole === 'admin' ? 'admin' : 'user');
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast.success(`Invite sent to ${inviteEmail}`);
      setInviteEmail('');
      setInviteRole('viewer');
      setShowInvite(false);
    } catch (e) {
      toast.error('Failed to send invite. The user may already be a member.');
    } finally {
      setInviting(false);
    }
  };

  const handleChangeRole = async (member, newRole) => {
    await base44.entities.TeamMember.update(member.id, { role: newRole });
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
    toast.success(`Role updated to ${ROLE_META[newRole].label}`);
  };

  const handleRemove = async (member) => {
    await base44.entities.TeamMember.delete(member.id);
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
    toast.success('Member removed');
  };

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage who has access and what they can do</p>
        </div>
        {isAdmin && (
          <Button
            onClick={() => setShowInvite(true)}
            className="bg-indigo-600 hover:bg-indigo-700 rounded-lg"
          >
            <Plus className="w-4 h-4 mr-2" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Role legend */}
      <div className="grid sm:grid-cols-3 gap-3 mb-8">
        {Object.entries(ROLE_META).map(([key, meta]) => {
          const Icon = meta.icon;
          return (
            <div key={key} className="p-4 border border-slate-100 rounded-xl bg-white">
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-slate-800 text-sm">{meta.label}</span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">{meta.description}</p>
            </div>
          );
        })}
      </div>

      {/* Members list */}
      <Card className="border-slate-100">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4 text-slate-400" />
            Team Members
            <Badge variant="secondary" className="ml-1 text-xs">{members.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
            </div>
          ) : members.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No team members yet.</p>
              {isAdmin && (
                <Button
                  onClick={() => setShowInvite(true)}
                  variant="outline"
                  size="sm"
                  className="mt-3 rounded-lg"
                >
                  Invite someone
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {/* Current user row */}
              <div className="flex items-center justify-between px-6 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-xs font-bold text-indigo-700">
                    {user?.full_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{user?.full_name || user?.email}</p>
                    <p className="text-xs text-slate-400">{user?.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <RoleBadge role={user?.role === 'admin' ? 'admin' : 'viewer'} />
                  <Badge variant="outline" className="text-xs text-slate-400">You</Badge>
                </div>
              </div>

              {members.map((member) => (
                <div key={member.id} className="flex items-center justify-between px-6 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center text-xs font-bold text-slate-500">
                      {member.email[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">{member.email}</p>
                      <p className="text-xs text-slate-400">
                        {member.status === 'pending' ? 'Invite pending' : 'Active'}
                        {member.invited_by && ` · invited by ${member.invited_by}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <RoleBadge role={member.role} />
                    {member.status === 'pending' && (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-200">Pending</Badge>
                    )}
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreVertical className="w-3.5 h-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleChangeRole(member, 'admin')}>
                            <Crown className="w-3.5 h-3.5 mr-2" /> Make Admin
                            {member.role === 'admin' && <Check className="w-3 h-3 ml-auto" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleChangeRole(member, 'editor')}>
                            <Edit3 className="w-3.5 h-3.5 mr-2" /> Make Editor
                            {member.role === 'editor' && <Check className="w-3 h-3 ml-auto" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleChangeRole(member, 'viewer')}>
                            <Eye className="w-3.5 h-3.5 mr-2" /> Make Viewer
                            {member.role === 'viewer' && <Check className="w-3 h-3 ml-auto" />}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleRemove(member)}
                            className="text-red-600 mt-1"
                          >
                            <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-1.5 block">Email address</Label>
              <Input
                type="email"
                placeholder="colleague@company.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
                className="rounded-lg"
              />
            </div>
            <div>
              <Label className="mb-1.5 block">Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger className="rounded-lg">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>
                      <div>
                        <p className="font-medium">{meta.label}</p>
                        <p className="text-xs text-slate-500">{meta.description}</p>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)} className="rounded-lg">Cancel</Button>
            <Button
              onClick={handleInvite}
              disabled={!inviteEmail.trim() || inviting}
              className="bg-indigo-600 hover:bg-indigo-700 rounded-lg"
            >
              {inviting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <><Mail className="w-4 h-4 mr-2" />Send Invite</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}