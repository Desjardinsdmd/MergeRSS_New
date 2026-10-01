import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { Logo, MicroLabel } from '@/components/brand/Brand';

const UserNotRegisteredError = () => {
  return (
    <div className="app-backdrop flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo size="lg" className="mb-8" />
      <div className="panel w-full max-w-md p-8">
        <div className="text-center">
          <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-xl border border-amber-400/25 bg-amber-400/10">
            <ShieldAlert className="h-7 w-7 text-amber-400" aria-hidden="true" />
          </div>
          <h1 className="mb-3 font-display text-[28px] font-semibold tracking-tight text-stone-100">Access restricted</h1>
          <p className="mb-8 text-[15px] text-stone-400">
            You are not registered to use this application. Contact the app administrator to request access.
          </p>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 text-left text-sm text-stone-400">
            <MicroLabel>If you believe this is an error</MicroLabel>
            <ul className="mt-2 list-inside list-disc space-y-1">
              <li>Verify you are logged in with the correct account</li>
              <li>Contact the app administrator for access</li>
              <li>Try logging out and back in again</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
