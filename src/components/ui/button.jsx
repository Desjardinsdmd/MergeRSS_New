import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-[linear-gradient(135deg,hsl(var(--primary)/0.92),hsl(var(--primary)/0.72))] bg-primary font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.75)] hover:brightness-110",
        destructive:
          "border border-red-400/30 bg-red-500/15 text-red-300 hover:bg-red-500/25 hover:text-red-200",
        outline:
          "border border-white/10 bg-transparent text-stone-300 hover:bg-white/[0.05] hover:text-stone-100",
        secondary:
          "border border-[hsl(var(--brand)/0.3)] bg-[hsl(var(--brand)/0.14)] text-[#D9C7FE] hover:bg-[hsl(var(--brand)/0.22)]",
        ghost: "border border-transparent text-stone-300 hover:border-white/10 hover:bg-white/[0.05] hover:text-stone-100",
        link: "text-[#C4A5FD] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button"
  return (
    (<Comp
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props} />)
  );
})
Button.displayName = "Button"

export { Button, buttonVariants }
