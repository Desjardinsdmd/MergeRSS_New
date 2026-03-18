import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Saves alert schedule preference to AlertSettings entity.
 * Note: The actual automation schedule must be updated manually via the
 * admin dashboard if frequency changes — this stores the config for reference.
 */
Deno.serve(async (req) => {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') {
        return Response.json({ error: 'Admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const hours = Number(body.frequency_hours);
    if (!hours || hours < 1) {
        return Response.json({ error: 'Invalid frequency_hours' }, { status: 400 });
    }

    // Upsert AlertSettings
    const existing = await base44.asServiceRole.entities.AlertSettings.list('-created_date', 1).catch(() => []);
    if (existing[0]) {
        await base44.asServiceRole.entities.AlertSettings.update(existing[0].id, { frequency_hours: hours });
    } else {
        await base44.asServiceRole.entities.AlertSettings.create({ frequency_hours: hours });
    }

    return Response.json({ success: true, frequency_hours: hours });
});