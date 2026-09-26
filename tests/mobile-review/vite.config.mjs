// Isolated visual QA only. Not imported by the application or its production build.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
const root = fileURLToPath(new URL("../../", import.meta.url));
export default defineConfig({
  root: resolve(root, "tests/mobile-review"),
  server: { host: "127.0.0.1", port: 8081, strictPort: true, fs: { allow: [root] } },
  resolve: {
    alias: [
      {
        find: "@tanstack/react-router",
        replacement: resolve(root, "tests/mobile-review/router.tsx"),
      },
      {
        find: "@tanstack/react-start",
        replacement: resolve(root, "tests/mobile-review/server.ts"),
      },
      {
        find: "@/integrations/supabase/client",
        replacement: resolve(root, "tests/mobile-review/supabase.ts"),
      },
      { find: "@", replacement: resolve(root, "src") },
    ],
  },
  plugins: [
    {
      name: "offline-functions",
      enforce: "pre",
      resolveId(id) {
        if (id.includes("/src/lib/") && /\.functions(?:\.ts)?$/.test(id)) return `\0fixture:${id}`;
      },
      load(id) {
        if (!id.startsWith("\0fixture:")) return;
        const file = id.slice(9);
        const source = readFileSync(file.endsWith(".ts") ? file : `${file}.ts`, "utf8");
        const names = [...source.matchAll(/export (?:async )?(?:const|function) (\w+)/g)].map(
          (match) => match[1],
        );
        return names
          .map(
            (name) =>
              `export const ${name} = (...args) => window.mithaqFixtureCall(${JSON.stringify(name)}, args);`,
          )
          .join("\n");
      },
    },
    react(),
    tailwind(),
  ],
});
