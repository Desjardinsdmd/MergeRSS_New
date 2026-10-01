import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef(({ className, type, ...props }, ref) => {
  return (
    (<input
      type={type}
      className={cn(
        "flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.03] text-stone-100 shadow-none transition-colors placeholder:text-stone-500 focus-visible:outline-none focus-visible:border-[hsl(var(--primary)/0.6)] focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring)/0.35)] px-3 py-1 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      ref={ref}
      {...props} />)
  );
})
Input.displayName = "Input"

export { Input }
