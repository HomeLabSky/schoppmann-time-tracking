import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Für den Container-Betrieb (frontend/Dockerfile) wird ein eigenständiges Paket gebaut.
  // Lokal (npm run dev / npm start) bleibt das Verhalten unverändert.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,
  // Kein Versions-Header "X-Powered-By: Next.js"
  poweredByHeader: false,
};

export default nextConfig;
