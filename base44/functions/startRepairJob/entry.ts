import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        if (!user || user.role !== 'admin') {
            return Response.json({ error: 'Admin only' }, { status: 403 });
        }

        // Check for already-running job
        const running = await base44.asServiceRole.entities.RepairJob.filter({ status: 'running' });
        if (running.length > 0) {
            const job = running[0];
            // Stale job guard: if no heartbeat for 10+ minutes, mark as failed
            const lastBeat = job.last_heartbeat_at ? new Date(job.last_heartbeat_at) : new Date(job.started_at || 0);
            const minutesStale = (Date.now() - lastBeat.getTime()) / 60000;
            if (minutesStale > 10) {
                await base44.asServiceRole.entities.RepairJob.update(job.id, {
                    status: 'failed',
                    completed_at: new Date().toISOString(),
                    summary: { error: 'Job timed out — no heartbeat for 10+ minutes' }
                });
            } else {
                return Response.json({ error: 'A repair job is already running', job_id: job.id }, { status: 409 });
            }
        }

        // Snapshot errored feeds
        const errorFeeds = await base44.asServiceRole.entities.Feed.filter({ status: 'error' });
        if (errorFeeds.length === 0) {
            return Response.json({ message: 'No errored feeds found', job_id: null });
        }

        // Create job record
        const job = await base44.asServiceRole.entities.RepairJob.create({
            status: 'running',
            total_count: errorFeeds.length,
            processed_count: 0,
            repaired_count: 0,
            deleted_count: 0,
            quarantined_count: 0,
            failed_count: 0,
            started_at: new Date().toISOString(),
            last_heartbeat_at: new Date().toISOString(),
            feed_ids_snapshot: errorFeeds.map(f => f.id),
        });

        // Kick off background worker (fire-and-forget)
        const workerUrl = req.url.replace('startRepairJob', 'repairJobWorker');
        fetch(workerUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': req.headers.get('Authorization') || '' },
            body: JSON.stringify({ job_id: job.id }),
        }).catch(e => console.error('Worker kickoff error:', e.message));

        return Response.json({ job_id: job.id, total_count: errorFeeds.length, message: 'Repair job started' });

    } catch (err) {
        return Response.json({ error: err.message }, { status: 500 });
    }
});