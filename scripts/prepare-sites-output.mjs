import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

const root = process.cwd();
const nitroOutput = resolve(root, ".output");
const sitesOutput = resolve(root, "dist");

await rm(sitesOutput, { recursive: true, force: true });
await mkdir(resolve(sitesOutput, "server"), { recursive: true });
await cp(resolve(nitroOutput, "server"), resolve(sitesOutput, "server"), {
  recursive: true,
});
await cp(resolve(nitroOutput, "public"), resolve(sitesOutput, "public"), {
  recursive: true,
});
await mkdir(resolve(sitesOutput, ".openai"), { recursive: true });
await cp(resolve(root, ".openai", "hosting.json"), resolve(sitesOutput, ".openai", "hosting.json"));

const publicDirectory = resolve(sitesOutput, "public");
const embeddedAssets = {};

async function collectAssets(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      await collectAssets(absolutePath);
      continue;
    }

    if (entry.name === "_headers") continue;

    const pathname = `/${relative(publicDirectory, absolutePath).split(sep).join("/")}`;
    embeddedAssets[pathname] = {
      body: (await readFile(absolutePath)).toString("base64"),
      extension: extname(entry.name).toLowerCase(),
    };
  }
}

await collectAssets(publicDirectory);

await rename(
  resolve(sitesOutput, "server", "index.mjs"),
  resolve(sitesOutput, "server", "nitro.mjs"),
);

await writeFile(
  resolve(sitesOutput, "server", "embedded-assets.mjs"),
  `export const embeddedAssets = ${JSON.stringify(embeddedAssets)};\n`,
);

await writeFile(
  resolve(sitesOutput, "server", "index.js"),
  `import nitro from "./nitro.mjs";
import { embeddedAssets } from "./embedded-assets.mjs";

const decodedAssets = new Map();
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function decodeAsset(pathname, encoded) {
  const cached = decodedAssets.get(pathname);
  if (cached) return cached;

  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  decodedAssets.set(pathname, bytes);
  return bytes;
}

export default {
  ...nitro,
  fetch(request, env, context) {
    const pathname = new URL(request.url).pathname;
    const asset = embeddedAssets[pathname];

    if (asset) {
      const headers = new Headers({
        "Cache-Control": pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "public, max-age=3600",
        "Content-Type": contentTypes[asset.extension] ?? "application/octet-stream",
      });
      const body = request.method === "HEAD" ? null : decodeAsset(pathname, asset.body);
      return new Response(body, { headers });
    }

    return nitro.fetch(request, env, context);
  },
};
`,
);

const wranglerPath = resolve(sitesOutput, "server", "wrangler.json");
const wrangler = JSON.parse(await readFile(wranglerPath, "utf8"));
wrangler.main = "index.js";
wrangler.assets = { ...wrangler.assets, directory: "../public" };
await writeFile(wranglerPath, `${JSON.stringify(wrangler, null, 2)}\n`);
