import { useEffect, useState } from "react";
import artixoLogo from "@/assets/artixo-logo-splash.png";

interface SplashScreenProps {
  onFinish: () => void;
}

// App opening animation - shown once per app load, before the router mounts. Purely
// decorative/branding, matches the liquid-glass look used across the sidebar (same
// floating blobs + glow treatment), then fades out to reveal the real app underneath.
export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadingOut(true), 1700);
    const finishTimer = setTimeout(() => onFinish(), 2200);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col items-center justify-center overflow-hidden bg-background transition-opacity duration-500 ease-out ${
        fadingOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      {/* Ambient floating glass blobs, same treatment as the sidebar */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl animate-sidebar-blob"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 bottom-20 h-64 w-64 rounded-full bg-secondary/20 blur-3xl animate-sidebar-blob"
        style={{ animationDelay: "2.5s" }}
      />

      <div className="relative flex flex-col items-center gap-5">
        <div className="relative animate-in fade-in zoom-in-75 duration-700">
          {/* Expanding ring pulses behind the logo */}
          <span className="absolute inset-0 rounded-3xl border-2 border-primary/40 animate-splash-ring" />
          <span
            className="absolute inset-0 rounded-3xl border-2 border-secondary/30 animate-splash-ring"
            style={{ animationDelay: "0.6s" }}
          />
          <div className="relative rounded-3xl bg-white/85 p-6 shadow-2xl animate-logo-glow">
            <img src={artixoLogo} alt="Artixo" className="h-24 w-24 object-contain" />
          </div>
        </div>

        <div
          className="text-center animate-in fade-in slide-in-from-bottom-2 duration-700 [animation-delay:250ms] [animation-fill-mode:backwards]"
        >
          <h1 className="text-4xl font-bold iridescent-glow tracking-tight">Artixo</h1>
          <p className="text-sm text-muted-foreground mt-1.5 tracking-widest uppercase">Wholesale Grocery POS</p>
        </div>

        <div
          className="w-40 h-1 rounded-full bg-muted overflow-hidden mt-1 animate-in fade-in duration-700 [animation-delay:450ms] [animation-fill-mode:backwards]"
        >
          <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-primary via-fuchsia-500 to-secondary animate-splash-bar" />
        </div>
      </div>
    </div>
  );
}
