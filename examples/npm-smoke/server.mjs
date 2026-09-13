import http from "node:http";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL(".", import.meta.url));
export async function startServer(port = 0) {
  await build({
    entryPoints: [dir + "app.js"],
    bundle: true,
    format: "esm",
    outfile: dir + "bundle.js",
    sourcemap: true,
  });
  const server = http.createServer(async (req, res) => {
    const name = {
      "/": "index.html",
      "/bundle.js": "bundle.js",
      "/bundle.js.map": "bundle.js.map",
    }[req.url];
    if (!name) {
      res.writeHead(404).end();
      return;
    }
    try {
      res.setHeader(
        "Content-Type",
        name.endsWith(".html") ? "text/html; charset=utf-8" : "text/javascript",
      );
      res.end(await readFile(dir + name));
    } catch {
      res.writeHead(500).end();
    }
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { url } = await startServer(Number(process.env.PORT || 4178));
  console.log(url);
}
