/**
 * Pure path-resolution helper for the fs-index-server binary.
 *
 * Extracted from filespace-server.ts so tests can drive the candidate-path
 * logic with a synthesized bundle layout (no need to spawn an actual server).
 *
 * Layout expectations:
 *   - macOS .app bundle:
 *       Contents/Resources/fs-index-server          ← the binary
 *       Contents/Resources/mcp/filespace-server.js  ← script (this scriptDir)
 *   - Dev checkout:
 *       <repo>/fs-index-server/fs-index-server      ← binary
 *       <repo>/mcp-server/dist/filespace-server.js  ← script (this scriptDir)
 *   - Flat (some custom installs):
 *       <dir>/fs-index-server   <dir>/filespace-server.js
 */
import { existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { execSync } from "node:child_process";

export interface FsIndexLocation {
  binaryPath: string;
  binaryDir: string;
}

/**
 * Resolve fs-index-server in this priority order:
 *   1. `explicit` if provided + exists
 *   2. Candidate paths derived from `scriptDir`
 *   3. PATH lookup via `which`
 *   4. cwd-based fallbacks (last resort)
 *
 * The first candidate (scriptDir/../fs-index-server) is critical: it's the
 * .app bundle layout. v2.5.0 shipped without this candidate, breaking
 * search for every customer.
 */
export function findFsIndexBinary(scriptDir: string, explicit?: string | null): FsIndexLocation | null {
  if (explicit && existsSync(explicit)) {
    return { binaryPath: resolve(explicit), binaryDir: dirname(resolve(explicit)) };
  }

  const candidates = [
    // .app bundle: Contents/Resources/fs-index-server is sibling of mcp/
    join(scriptDir, "..", "fs-index-server"),
    // Same dir as the script (flat layout)
    join(scriptDir, "fs-index-server"),
    // Dev checkout: repo_root/fs-index-server/fs-index-server
    join(scriptDir, "..", "fs-index-server", "fs-index-server"),
    join(scriptDir, "..", "..", "fs-index-server", "fs-index-server"),
    // cwd fallbacks
    join(process.cwd(), "fs-index-server", "fs-index-server"),
    join(process.cwd(), "fs-index-server"),
  ];

  for (const c of candidates) {
    const r = resolve(c);
    if (existsSync(r)) return { binaryPath: r, binaryDir: dirname(r) };
  }

  // PATH lookup
  try {
    const which = execSync("which fs-index-server", { encoding: "utf-8" }).trim();
    if (which && existsSync(which)) return { binaryPath: which, binaryDir: dirname(which) };
  } catch {
    // not on PATH
  }

  return null;
}
