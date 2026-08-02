import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 ring-offset-background",
  {
    variants: {
      variant: {
        default: "bg-primary/90 text-primary-foreground backdrop-blur-sm border border-primary/30 shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.4),inset_0_1px_0_0_hsla(0,0%,100%,0.15)] hover:bg-primary hover:shadow-[0_8px_24px_-4px_hsl(var(--primary)/0.5),inset_0_1px_0_0_hsla(0,0%,100%,0.2)] hover:-translate-y-0.5 active:translate-y-0",
        destructive: "bg-destructive/90 text-destructive-foreground backdrop-blur-sm border border-destructive/30 shadow-[0_4px_16px_-4px_hsl(var(--destructive)/0.4),inset_0_1px_0_0_hsla(0,0%,100%,0.15)] hover:bg-destructive hover:shadow-[0_8px_24px_-4px_hsl(var(--destructive)/0.5)]",
        outline: "border border-border/40 bg-background/40 backdrop-blur-md hover:bg-muted/30 hover:text-accent-foreground hover:border-border/60 shadow-[inset_0_1px_0_0_hsla(0,0%,100%,0.06)]",
        secondary: "bg-secondary/20 text-secondary backdrop-blur-sm border border-secondary/20 shadow-[inset_0_1px_0_0_hsla(0,0%,100%,0.1)] hover:bg-secondary/30 hover:border-secondary/30",
        ghost: "hover:bg-muted/30 hover:text-accent-foreground rounded-xl",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-9 rounded-lg px-3.5",
        lg: "h-11 rounded-xl px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
