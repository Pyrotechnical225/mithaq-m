// Produces local, synthetic previews only. This command never sends email.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import http from "node:http";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "artifacts", "notification-email-preview");
const source = await readFile(path.join(root, "src/lib/notification-email-policy.ts"), "utf8");
const code = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
vm.runInNewContext(code, { exports, URL, Date, Error });
const { EMAIL_KINDS, EMAIL_PALETTE: palette, renderNotificationEmail } = exports;
const escape = (value) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
await mkdir(output, { recursive: true });
const items = [];
for (const [kind, definition] of Object.entries(EMAIL_KINDS)) {
  const email = renderNotificationEmail(kind, "https://www.mithaq.uk");
  await writeFile(path.join(output, `${kind}.html`), email.html);
  await writeFile(path.join(output, `${kind}.txt`), email.text);
  items.push(
    `<section><h2>${escape(definition.subject)}</h2><p>${escape(definition.audience)} · ${escape(definition.category)} · ${escape(kind)}</p><div class="previews"><iframe title="Desktop: ${escape(definition.subject)}" sandbox="" loading="lazy" src="${kind}.html"></iframe><iframe class="mobile" title="Mobile: ${escape(definition.subject)}" sandbox="" loading="lazy" src="${kind}.html"></iframe></div><p><a href="${kind}.html">Open HTML</a> · <a href="${kind}.txt">Plain text</a></p></section>`,
  );
}
await writeFile(
  path.join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mithaq email previews</title><style>body{margin:0;padding:32px;background:${palette.background};color:${palette.foreground};font:16px/1.6 Arial,sans-serif}main{max-width:1120px;margin:auto}h1{margin-bottom:8px}h2{font-size:23px;margin:0}section{border-top:1px solid ${palette.border};padding:28px 0}.previews{display:flex;gap:24px;overflow:auto;padding:16px 0}iframe{border:1px solid ${palette.border};width:640px;height:1060px;flex:0 0 640px;background:${palette.background}}.mobile{width:320px;flex-basis:320px}a{color:${palette.primary}}p{margin:8px 0 16px}.notice{padding:16px;background:${palette.card};border-left:3px solid ${palette.primary}}</style></head><body><main><h1>Mithaq · email previews</h1><p class="notice">Local design review only. This preview does not send email. All ${items.length} templates use fixed copy and contain no member data. Desktop (640px) and narrow mobile (320px) previews appear side by side. This is not inbox-client verification.</p><p>Planned sender: no-reply@mithaq.uk · Links: https://www.mithaq.uk</p>${items.join("\n")}</main></body></html>`,
);
console.log(
  `Created ${items.length} HTML and plain-text previews. No email sent.\n${path.join(output, "index.html")}`,
);

if (process.argv.includes("--serve")) {
  const allowed = new Set([
    "index.html",
    ...Object.keys(EMAIL_KINDS).flatMap((kind) => [`${kind}.html`, `${kind}.txt`]),
  ]);
  const server = http.createServer(async (request, response) => {
    const name = new URL(request.url ?? "/", "http://localhost").pathname.slice(1) || "index.html";
    if (!["GET", "HEAD"].includes(request.method ?? "") || !allowed.has(name)) {
      response.writeHead(404).end();
      return;
    }
    try {
      response.writeHead(200, {
        "Content-Type": name.endsWith(".txt")
          ? "text/plain; charset=utf-8"
          : "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; frame-src 'self'; base-uri 'none'; form-action 'none'",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : await readFile(path.join(output, name)));
    } catch {
      response.end();
    }
  });
  server.listen(0, "127.0.0.1", () => {
    console.log(`Email-only preview: http://127.0.0.1:${server.address().port}/`);
  });
}
