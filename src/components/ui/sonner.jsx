"use client";
import { Toaster as Sonner } from "sonner"

const Toaster = ({
  ...props
}) => {
  return (
    (<Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:rounded-2xl group-[.toaster]:border-white/10 group-[.toaster]:bg-stone-900 group-[.toaster]:text-stone-100 group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-stone-400",
          actionButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-white/[0.06] group-[.toast]:text-stone-300",
        },
      }}
      {...props} />)
  );
}

export { Toaster }
