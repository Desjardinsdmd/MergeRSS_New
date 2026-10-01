import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    (<textarea
      className={cn(
        "flex min-h-[72px] w-full rounded-xl border border-white/10 bg-white/[0.03] text-stone-100 shadow-none transition-colors placeholder:text-stone-500 focus-visible:outline-none focus-visible:border-[hsl(var(--primary)/0.6)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.35)] px-3 py-2 text-base disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Textarea.displayName = "Textarea"

export { Textarea }
