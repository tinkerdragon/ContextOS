import { execFileSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

const projectRoot = join(__dirname, "..");

test("production bundle builds without errors", () => {
  execFileSync(process.execPath, ["esbuild.config.mjs", "production"], { cwd: projectRoot, stdio: "pipe" });

  const bundle = readFileSync(join(projectRoot, "main.js"), "utf8");
  expect(bundle.length).toBeGreaterThan(100000);
});
