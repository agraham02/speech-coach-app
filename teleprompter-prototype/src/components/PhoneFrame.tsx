import type { ReactNode } from "react";

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative h-[844px] w-[390px] shrink-0 overflow-hidden rounded-[52px] border-[6px] border-neutral-800 bg-black shadow-2xl shadow-black/60">
      {/* Fake, gently-shifting "camera feed" so the vignette/overlay has
          something believable to sit on top of without real camera access. */}
      <div className="absolute inset-0 animate-[drift_18s_ease-in-out_infinite] bg-[radial-gradient(circle_at_30%_20%,#2c3a55_0%,#141824_45%,#0a0b10_100%)] bg-[length:180%_180%]" />
      <div className="absolute inset-0 bg-black/10" />

      {/* Dynamic-island style camera cutout */}
      <div className="absolute top-3 left-1/2 z-20 h-6 w-28 -translate-x-1/2 rounded-full bg-black" />

      <div className="absolute inset-0 z-10">{children}</div>
    </div>
  );
}
