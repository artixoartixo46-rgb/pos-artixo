import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 backdrop-blur-sm",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/20 text-primary shadow-[0_0_8px_-2px_hsl(var(--primary)/0.3)]",
        secondary: "border-secondary/30 bg-secondary/20 text-secondary shadow-[0_0_8px_-2px_hsl(var(--secondary)/0.3)]",
        destructive: "border-destructive/30 bg-destructive/20 text-destructive shadow-[0_0_8px_-2px_hsl(var(--destructive)/0.3)]",
        outline: "text-foreground border-border/30 bg-background/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
