import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    // Find and delete all audit items (from audit-test.invalid domain)
    const auditItems = await base44.asServiceRole.entities.FeedItem.filter(
      { url: { $regex: 'audit-test.invalid' } },
      '-created_date',
      10000
    );

    let deleted = 0;
    for (const item of auditItems) {
      await base44.asServiceRole.entities.FeedItem.delete(item.id);
      deleted++;
    }

    return Response.json({ 
      success: true, 
      deletedCount: deleted,
      message: `Removed ${deleted} audit test items`
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});