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

const chunkCache = new Map<string, string>();

export function loadChunk(filename: string): string {
  if (chunkCache.has(filename)) {
    return chunkCache.get(filename)!;
  }
  const content = readFileSync(resolve(CHUNKS_DIR, filename), "utf-8");
  chunkCache.set(filename, content);
  return content;
}

// Section index: chunk filename -> array of {heading, start, end} byte offsets,
// where each section spans from a top-level "## ..." heading to the next one
// (or EOF). Built lazily on first use of a chunk.
interface Section {
  heading: string;
  start: number;
  end: number;
}
const sectionCache = new Map<string, Section[]>();

function getSections(filename: string): Section[] {
  const cached = sectionCache.get(filename);
  if (cached) return cached;

  const content = loadChunk(filename);
  const sections: Section[] = [];
  // Match "## " at line start (top-level only — not "### " or deeper).
  const re = /^## +(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    sections.push({ heading: m[1].trim(), start: m.index, end: content.length });
  }
  for (let i = 0; i < sections.length - 1; i++) {
    sections[i].end = sections[i + 1].start;
  }
  sectionCache.set(filename, sections);
  return sections;
}

const CONTEXT_CHARS = 500;

// Extract a focused excerpt around the first match for any query token.
// Returns the entire enclosing ## section if it's small (<2 KB), or
// otherwise a window of ±CONTEXT_CHARS around the match within the section.
function extractSnippet(filename: string, queryTokens: string[]): string {
  const content = loadChunk(filename);
  const lower = content.toLowerCase();

  let matchIdx = -1;
  for (const qt of queryTokens) {
    const idx = lower.indexOf(qt);
    if (idx !== -1 && (matchIdx === -1 || idx < matchIdx)) {
      matchIdx = idx;
    }
  }
  if (matchIdx === -1) {
    // No literal token match (matched via keyword/heading scoring) — return
    // the document head so the LLM still gets useful context.
    return content.slice(0, Math.min(content.length, CONTEXT_CHARS * 4));
  }

  const sections = getSections(filename);
  const section = sections.find((s) => matchIdx >= s.start && matchIdx < s.end);

  if (!section) {
    // Match landed before the first ## heading (preamble).
    const start = Math.max(0, matchIdx - CONTEXT_CHARS);
    const end = Math.min(content.length, matchIdx + CONTEXT_CHARS);
    return content.slice(start, end);
  }

  const sectionText = content.slice(section.start, section.end);
  if (sectionText.length <= 2000) return sectionText;

  // Section is large — narrow to a window around the match.
  const localIdx = matchIdx - section.start;
  const start = Math.max(0, localIdx - CONTEXT_CHARS);
  const end = Math.min(sectionText.length, localIdx + CONTEXT_CHARS);
  return `## ${section.heading}\n\n…\n${sectionText.slice(start, end)}\n…`;
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
    for (const kw of chunk.keywords) {
      if (kw === qt) {
        score += 10;
      } else if (kw.includes(qt) || qt.includes(kw)) {
        score += 5;
      }
    }

    if (nameLower.includes(qt)) score += 8;
    if (descLower.includes(qt)) score += 3;
    if (content.includes(qt)) score += 4;
  }

  const fullQuery = queryTokens.join(" ");
  if (fullQuery.length > 3 && content.includes(fullQuery)) {
    score += 15;
  }

  const headingPattern = new RegExp(
    `^#{1,4}\\s+.*${queryTokens.map(escapeRegex).join(".*")}`,
    "im",
  );
  if (headingPattern.test(content)) {
    score += 8;
  }

  return score;
}

export function searchDocs(query: string, maxResults: number, full = false): string[] {
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
    if (full) {
      const content = loadChunk(s.chunk.filename);
      return `# ${s.chunk.name}\n\n${content}`;
    }
    const snippet = extractSnippet(s.chunk.filename, queryTokens);
    return (
      `# ${s.chunk.name}\n\n` +
      `${snippet}\n\n` +
      `_Snippet from \`${s.chunk.filename}\`. ` +
      `Read full chunk via resource \`lucidlink-sdk://docs/${s.chunk.id}\` ` +
      `or call lucidlink_sdk_search again with full=true._`
    );
  });
}
