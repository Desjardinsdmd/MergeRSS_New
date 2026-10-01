import React from "react";
import { Logo } from "@/components/brand/Brand";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="app-backdrop flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="mb-8 text-center">
          {Icon && (
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl border border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)]">
              <Icon className="h-6 w-6 text-[#C4A5FD]" aria-hidden="true" />
            </div>
          )}
          <h1 className="font-display text-[28px] font-semibold tracking-tight text-stone-100">{title}</h1>
          {subtitle && <p className="mt-2 text-[15px] text-stone-400">{subtitle}</p>}
        </div>
        <div className="panel p-8">
          {children}
        </div>
        {footer && (
          <p className="mt-6 text-center text-sm text-stone-500">{footer}</p>
        )}
      </div>
    </div>
  );
}
