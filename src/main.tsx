import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);

// This app is installed as a standalone PWA on staff phones (POS Terminal must keep working
// offline), which means once a service worker is installed, the browser is NOT guaranteed to
// notice a new deploy for up to 24h on its own (that's the spec default SW update-check
// throttle - it isn't affected by our server's cache-control headers). Without this, a bug fix
// pushed to git and live on Vercel can silently sit unseen on a cashier's phone for a full day.
// So: force a fresh update check every minute, and when a new version is found, let the SW take
// over (skipWaiting/clientsClaim already happen in the generated SW) and prompt a reload instead
// of forcing one - a forced reload mid-sale at the POS Terminal would drop the in-progress cart.
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    setInterval(() => {
      registration.update().catch(() => {});
    }, 60_000);
  },
  onNeedRefresh() {
    toast("A new version of Artixo POS is available.", {
      duration: Infinity,
      action: {
        label: "Refresh now",
        onClick: () => updateSW(true),
      },
    });
  },
});
