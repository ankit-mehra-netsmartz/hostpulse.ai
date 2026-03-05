import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

/** Eastern time mmddyyhhmm + A (AM) or P (PM). Updated automatically on every build. */
function getBuildVersionLabel(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const parts = formatter.formatToParts(now);
  const get = (type: Intl.DateTimeFormatPart["type"]) => parts.find((p) => p.type === type)?.value ?? "";
  const mm = get("month");
  const dd = get("day");
  const yy = get("year");
  const hh = get("hour").padStart(2, "0");
  const min = get("minute");
  const hour24 = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" })).getHours();
  const ampm = hour24 >= 12 ? "P" : "A";
  return `${mm}${dd}${yy}${hh}${min}${ampm}`;
}

export default defineConfig({
  define: {
    __VERSION_SOURCE__: JSON.stringify(process.env.VITE_APP_VERSION_SOURCE ?? "C"),
    __BUILD_VERSION_LABEL__: JSON.stringify(getBuildVersionLabel()),
  },
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
