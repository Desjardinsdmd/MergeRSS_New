import * as React from "react"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))]",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[hsl(var(--brand)/0.16)] text-[#C4A5FD]",
        secondary:
          "border-transparent bg-white/[0.06] text-stone-300",
        destructive:
          "border-red-400/25 bg-red-400/10 text-red-300",
        outline: "border-white/10 text-stone-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  ...props
}) {
  return (<div className={cn(badgeVariants({ variant }), className)} {...props} />);
}

export { Badge, badgeVariants }
