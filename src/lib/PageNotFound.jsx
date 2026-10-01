import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Home, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LogoMark, MicroLabel } from '@/components/brand/Brand';

export default function PageNotFound() {
  return (
    <div className="app-backdrop flex min-h-screen items-center justify-center p-6">
      <div className="panel w-full max-w-md p-10 text-center">
        <LogoMark size="lg" className="mx-auto mb-6" />

        <MicroLabel className="mb-2">Error 404</MicroLabel>
        <h1 className="mb-3 font-display text-[28px] font-semibold tracking-tight text-stone-100">Page not found</h1>
        <p className="mb-8 text-[15px] text-stone-400">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button asChild>
            <Link to={createPageUrl('Dashboard')}>
              <Home className="h-4 w-4" aria-hidden="true" />
              Go to Today
            </Link>
          </Button>
          <Button variant="outline" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Go back
          </Button>
        </div>
      </div>
    </div>
  );
}
