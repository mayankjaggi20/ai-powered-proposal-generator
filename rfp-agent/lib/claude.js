import Anthropic from "@anthropic-ai/sdk";
import fs from "fs/promises";
import path from "path";

export const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-5-5";

// Reads ANTHROPIC_API_KEY from the environment
export const client = new Anthropic();

// Loads every .md / .txt file in /knowledge as the company knowledge base
export async function loadKnowledge() {
  const dir = path.join(process.cwd(), "knowledge");
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
