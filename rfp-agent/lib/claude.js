import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

// Reads ANTHROPIC_API_KEY from the environment (set in Vercel, never in code)
export const client = new Anthropic();

const ROOT = process.cwd();

const DEFAULT_SETTINGS = {
  model: "claude-sonnet-5-5",
  max_web_searches: 4,
  max_questions: 8,
  blocked_domains: [],
  allowed_domains: [],
  check_claims_after_draft: true,
};

export async function loadSettings() {
  try {
    const raw = await fs.readFile(path.join(ROOT, "config", "settings.json"), "utf8");
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function readConfig(name) {
  try {
    return (await fs.readFile(path.join(ROOT, "config", name), "utf8")).trim();
  } catch {
    return "";
  }
}

// Loads every .md / .txt file in /knowledge as the company knowledge base
export async function loadKnowledge() {
  const dir = path.join(ROOT, "knowledge");
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return "(No knowledge files found.)";
  }
  const files = names
    .filter((n) => /\.(md|txt)$/i.test(n) && n.toLowerCase() !== "readme.md")
    .sort();
  if (!files.length) return "(No knowledge files found.)";
  const docs = await Promise.all(
    files.map(async (n) => {
      const body = await fs.readFile(path.join(dir, n), "utf8");
      return `<document name="${n}">\n${body.trim()}\n</document>`;
    })
  );
  return docs.join("\n\n");
}

// Builds a system prompt: role instructions + voice + guardrails + knowledge (+ fixed output format)
export async function buildSystem(roleFile, outputFormat = "") {
  const [role, voice, guardrails, knowledge] = await Promise.all([
    readConfig(roleFile),
    readConfig("company-voice.md"),
    readConfig("guardrails.md"),
    loadKnowledge(),
  ]);
  return [
    role,
    voice && `<company_voice>\n${voice}\n</company_voice>`,
    guardrails && `<guardrails>\n${guardrails}\n</guardrails>`,
    `<knowledge>\n${knowledge}\n</knowledge>`,
    outputFormat,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function webSearchTool(settings) {
  const tool = { type: "web_search_20250305", name: "web_search", max_uses: settings.max_web_searches };
  if (settings.allowed_domains?.length) tool.allowed_domains = settings.allowed_domains;
  else if (settings.blocked_domains?.length) tool.blocked_domains = settings.blocked_domains;
  return tool;
}

// Turns the uploaded RFP into a Claude content block
export function rfpBlock(rfp) {
  if (rfp.kind === "pdf") {
    return {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: rfp.data },
      title: rfp.name || "RFP",
    };
  }
  return { type: "text", text: `<rfp name="${rfp.name || "RFP"}">\n${rfp.text}\n</rfp>` };
}

export function answersText(analysis, answers) {
  return (analysis?.questions || [])
    .map((q) => `${q.id}. ${q.question}\nAnswer: ${answers?.[q.id]?.trim() || "(no answer, mark as TO CONFIRM)"}`)
    .join("\n\n");
}

export function extractTagged(text, tag) {
  const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? JSON.parse(m[1].trim()) : null;
}
