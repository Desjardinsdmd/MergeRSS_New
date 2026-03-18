import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        const { job_id, limit = 200 } = await req.json().catch(() => ({}));
        if (!job_id) return Response.json({ error: 'job_id required' }, { status: 400 });

        const logs = await base44.asServiceRole.entities.RepairJobLog.filter(
            { job_id },
            'created_date',
            Number(limit)
        );

        return Response.json({ logs });
    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});