import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { iptvProxy } from "./server/iptvProxy";

export default defineConfig({
  plugins: [react(), iptvProxy()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
