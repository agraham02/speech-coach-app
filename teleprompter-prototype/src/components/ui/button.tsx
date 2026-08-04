import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
  {
    variants: {
      variant: {
        default: "bg-indigo-500 text-white hover:bg-indigo-400",
        secondary: "bg-white/10 text-white hover:bg-white/15",
        ghost: "bg-transparent text-white/70 hover:bg-white/10 hover:text-white",
      },
      size: {
        default: "h-10 px-4",
        icon: "h-10 w-10",
        sm: "h-8 px-3 text-xs",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
