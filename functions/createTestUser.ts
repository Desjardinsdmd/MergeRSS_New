import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const testEmail = 'test@example.com';
    await base44.users.inviteUser(testEmail, 'user');

    return Response.json({ 
      message: 'Test user invited successfully',
      email: testEmail 
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});