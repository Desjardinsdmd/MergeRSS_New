import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    
    // 1. Who is the authenticated user?
    const user = await base44.auth.me();
    
    // 2. Try .list() as the user
    let userListResult, userListError;
    try {
      userListResult = await base44.entities.CustomLens.list('-created_date', 50);
    } catch (e) {
      userListError = e.message;
    }
    
    // 3. Try .filter() as the user
    let userFilterResult, userFilterError;
    try {
      userFilterResult = await base44.entities.CustomLens.filter({}, '-created_date', 50);
    } catch (e) {
      userFilterError = e.message;
    }
    
    // 4. Try service role .list()
    let serviceListResult, serviceListError;
    try {
      serviceListResult = await base44.asServiceRole.entities.CustomLens.list('-created_date', 50);
    } catch (e) {
      serviceListError = e.message;
    }
    
    // 5. Try service role .filter() with created_by
    let serviceFilterResult, serviceFilterError;
    try {
      serviceFilterResult = await base44.asServiceRole.entities.CustomLens.filter(
        { created_by: user?.email }, '-created_date', 50
      );
    } catch (e) {
      serviceFilterError = e.message;
    }

    return Response.json({
      authenticated_user: {
        email: user?.email,
        full_name: user?.full_name,
        role: user?.role,
        id: user?.id,
      },
      user_list: { count: userListResult?.length, data: userListResult, error: userListError },
      user_filter: { count: userFilterResult?.length, data: userFilterResult, error: userFilterError },
      service_list: { count: serviceListResult?.length, data: serviceListResult, error: serviceListError },
      service_filter_by_email: { count: serviceFilterResult?.length, data: serviceFilterResult, error: serviceFilterError },
    });
  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});