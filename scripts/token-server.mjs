#!/usr/bin/env node
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const PORT = Number(process.env.TOKEN_SERVER_PORT ?? 3030);
const ENV_PATH = resolve(process.cwd(), ".env");

function readAuthorizationFromEnvFile() {
    if (!existsSync(ENV_PATH)) return null;
    const txt = readFileSync(ENV_PATH, "utf8");

    // matches AUTHORIZATION="Bearer xxx" or AUTHORIZATION=Bearer xxx
    const m = txt.match(/^\s*AUTHORIZATION\s*=\s*("?)(.*?)\1\s*$/m);
    if (!m) return null;

    const val = (m[2] ?? "").trim();
    return val || null;
}

http
    .createServer((req, res) => {
        if (req.url !== "/token") {
            res.writeHead(404, { "content-type": "application/json" });
            return res.end(JSON.stringify({ error: "not_found" }));
        }

        const auth = readAuthorizationFromEnvFile();
        if (!auth) {
            res.writeHead(503, { "content-type": "application/json" });
            return res.end(JSON.stringify({ error: "AUTHORIZATION_not_found" }));
        }

        res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
        res.end(JSON.stringify({ authorization: auth }));
    })
    .listen(PORT, () => {
        console.log(`Token server: http://localhost:${PORT}/token`);
    });
