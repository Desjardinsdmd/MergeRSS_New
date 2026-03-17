import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const ALERT_AUTOMATION_ID = '69b8a58429cea6257c9aeca8';

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

    // Update the automation via the Base44 SDK
    await base44.asServiceRole.automations.update(ALERT_AUTOMATION_ID, {
        repeat_interval: hours,
        repeat_unit: 'hours',
    });

    return Response.json({ success: true, repeat_interval: hours, repeat_unit: 'hours' });
});