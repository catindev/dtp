import { execSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  define: {
    __DTP_COMMIT__: JSON.stringify(readGitCommit()),
  },
  plugins: [react(), dtpDebugLogPlugin()],
});

function readGitCommit(): string {
  try {
    const commit = execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    const dirty = execSync("git status --short", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    return `${commit || "nogit"}${dirty ? "-dirty" : ""}`;
  } catch {
    return "nogit";
  }
}

function dtpDebugLogPlugin(): Plugin {
  return {
    name: "dtp-debug-log",
    configureServer(server) {
      server.middlewares.use("/__dtp-debug-log", (request, response, next) => {
        if (request.method !== "POST") {
          next();
          return;
        }

        let body = "";
        request.setEncoding("utf8");
        request.on("data", (chunk) => {
          body += chunk;
        });
        request.on("end", async () => {
          try {
            const dir = path.resolve(process.cwd(), ".dtp-debug");
            await mkdir(dir, { recursive: true });
            await writeFile(path.join(dir, "latest-run.json"), body);
            response.statusCode = 204;
            response.end();
          } catch (error) {
            server.config.logger.error(String(error));
            response.statusCode = 500;
            response.end();
          }
        });
      });
    },
  };
}
