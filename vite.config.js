@'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
'@ | Set-Content -Encoding UTF8 vite.config.js
