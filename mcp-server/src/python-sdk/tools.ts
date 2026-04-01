import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CHUNKS, type ChunkMeta } from "./constants.js";

const __dir = dirname(fileURLToPath(import.meta.url));

// Try multiple locations for chunks (dev: src/python-sdk/chunks, prod: dist/python-sdk/chunks or bundled)
function findChunksDir(): string {
  const candidates = [
    resolve(__dir, "chunks"),
    resolve(__dir, "..", "python-sdk", "chunks"),
    resolve(__dir, "..", "..", "src", "python-sdk", "chunks"),
  ];

  for (const dir of candidates) {
    try {
      const files = readdirSync(dir);
      if (files.some((f) => f.endsWith(".md"))) {
        return dir;
      }
    } catch {
      // not found, try next
    }
  }

  throw new Error("python-sdk chunks directory not found");
}

const CHUNKS_DIR = findChunksDir();

// Cache loaded chunks
const chunkCache = new Map<string, string>();

export function loadChunk(filename: string): string {
  if (chunkCache.has(filename)) {
    return chunkCache.get(filename)!;
  }
  const content = readFileSync(resolve(CHUNKS_DIR, filename), "utf-8");
  chunkCache.set(filename, content);
  return content;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

interface ScoredChunk {
  chunk: ChunkMeta;
  score: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function scoreChunk(chunk: ChunkMeta, queryTokens: string[]): number {
  let score = 0;
  const content = loadChunk(chunk.filename).toLowerCase();
  const nameLower = chunk.name.toLowerCase();
  const descLower = chunk.description.toLowerCase();

  for (const qt of queryTokens) {
    // Exact keyword match (highest weight)
    for (const kw of chunk.keywords) {
      if (kw === qt) {
        score += 10;
      } else if (kw.includes(qt) || qt.includes(kw)) {
        score += 5;
      }
    }

    // Match in name/description
    if (nameLower.includes(qt)) score += 8;
    if (descLower.includes(qt)) score += 3;

    // Match in content
    if (content.includes(qt)) score += 4;
  }

  // Bonus for exact multi-word match in content
  const fullQuery = queryTokens.join(" ");
  if (fullQuery.length > 3 && content.includes(fullQuery)) {
    score += 15;
  }

  // Bonus for matching heading text
  const headingPattern = new RegExp(
    `^#{1,4}\\s+.*${queryTokens.map(escapeRegex).join(".*")}`,
    "im",
  );
  if (headingPattern.test(content)) {
    score += 8;
  }

  return score;
}

export function searchDocs(query: string, maxResults: number): string[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return ["Please provide a search query."];
  }

  const scored: ScoredChunk[] = CHUNKS.map((chunk) => ({
    chunk,
    score: scoreChunk(chunk, queryTokens),
  }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);

  if (scored.length === 0) {
    return [
      "No direct matches found. Available documentation sections:\n\n" +
        CHUNKS.map((c) => `- **${c.name}**: ${c.description}`).join("\n"),
    ];
  }

  return scored.map((s) => {
    const content = loadChunk(s.chunk.filename);
    return `# ${s.chunk.name}\n\n${content}`;
  });
}
