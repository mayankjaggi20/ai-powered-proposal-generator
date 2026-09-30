import { client, loadSettings, buildSystem, webSearchTool, rfpBlock, extractTagged } from "@/lib/claude";

export const maxDuration = 300; // web research can take a minute or two

const outputFormat = (maxQuestions) => `Ask at most ${maxQuestions} questions.

Finish with exactly one JSON object inside <result></result> tags and nothing after it:
{
  "client": "issuing organization",
  "rfp_title": "title of the RFP",
  "due_date": "submission deadline or null",
  "summary": "3 to 5 sentences on what they want and why",
  "client_research": "one short paragraph of relevant facts from the web",
  "fit": { "verdict": "Go" | "Go with caution" | "No-go", "reason": "one or two sentences based on our knowledge base" },
  "response_structure": ["section names the proposal must contain, in the order the RFP requires"],
  "requirements": [ { "id": "R1", "text": "requirement", "mandatory": true } ],
  "risks": ["risky clauses or red flags in the RFP, if any"],
  "questions": [ { "id": "Q1", "question": "question for the bid team", "why": "what it unlocks in the proposal" } ]
}`;

export async function POST(req) {
  try {
    const { rfp, notes } = await req.json();
    if (!rfp) return Response.json({ error: "Add an RFP first." }, { status: 400 });

    const settings = await loadSettings();
    const system = await buildSystem("analyst-instructions.md", outputFormat(settings.max_questions));
    const tools = [webSearchTool(settings)];

    const messages = [
      {
        role: "user",
        content: [
          rfpBlock(rfp),
          { type: "text", text: `Notes from the bid team: ${notes?.trim() || "none"}\n\nAnalyze this RFP.` },
        ],
      },
    ];

    // Server-side web search can pause a long turn; continue it if so
    const allBlocks = [];
    for (let i = 0; i < 4; i++) {
      const response = await client.messages.create({ model: settings.model, max_tokens: 8000, system, tools, messages });
      allBlocks.push(...response.content);
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }

    const text = allBlocks.filter((b) => b.type === "text").map((b) => b.text).join("");
    const analysis = extractTagged(text, "result");
    if (!analysis) {
      return Response.json({ error: "The agent did not return a structured analysis. Try again." }, { status: 502 });
    }

    const sources = [];
    for (const b of allBlocks) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) {
          if (r.url && !sources.find((s) => s.url === r.url)) sources.push({ url: r.url, title: r.title });
        }
      }
    }

    return Response.json({ analysis, sources: sources.slice(0, 10), checkClaims: settings.check_claims_after_draft });
  } catch (err) {
    return Response.json({ error: err.message || "Analysis failed." }, { status: 500 });
  }
}
