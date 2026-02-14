import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: "build",
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }
          if (id.includes("react")) {
            return "vendor-react";
          }
          if (id.includes("@mui")) {
            return "vendor-mui";
          }
          if (id.includes("@supabase")) {
            return "vendor-supabase";
          }
          if (id.includes("@tanstack")) {
            return "vendor-tanstack";
          }
          return "vendor-others";
        },
      },
    },
  },
  plugins: [react()],
});
