import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            // Firebase — split per module so chunks download in parallel
            if (id.includes("firebase/auth")) return "firebase-auth";
            if (id.includes("firebase/firestore")) return "firebase-firestore";
            if (id.includes("firebase/functions")) return "firebase-functions";
            if (id.includes("firebase/messaging")) return "firebase-messaging";
            if (id.includes("firebase/storage")) return "firebase-storage";
            if (id.includes("firebase")) return "firebase-core";
            // MQTT client — second biggest
            if (id.includes("mqtt")) return "mqtt-vendor";
            return "vendor";
          }
        },
      },
    },
    // Keep 500 — if it still warns, a chunk is genuinely too big. Never hide it.
    chunkSizeWarningLimit: 500,
  },
});
