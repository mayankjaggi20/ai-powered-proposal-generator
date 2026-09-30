import { client, MODEL, loadKnowledge, rfpBlock } from "@/lib/claude";

export const maxDuration = 300; // web research can take a minute or two

const INSTRUCTIONS = `You are the bid analyst for our company. You read an RFP, research the issuing organization on the web, and prepare the ground for a proposal.

Our internal knowledge base is provided in <knowledge>. It is the only source of truth about our company: capabilities, case studies, team, certifications. Never invent facts about us.

Steps:
1. Read the RFP carefully. Extract every requirement (especially "shall", "must", "required" statements), the evaluation criteria, the required response structure, and the deadline.
2. Run 2 to 4 focused web searches on the issuing organization: who they are, recent news or strategy, and anything about their technology landscape relevant to this RFP.
3. Decide what you still need from the bid team. Only ask what cannot be answered from the RFP, the knowledge base, or the web: pricing, named team members, availability, win themes, assumptions, partner involvement and similar. Ask at most 8 questions, most important first, all in one batch.

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
  "questions": [ { "id": "Q1", "question": "question for the bid team", "why": "what it unlocks in the proposal" } ]
}`;

export async function POST(req) {
  try {
    const { rfp, notes } = await req.json();
    if (!rfp) return Response.json({ error: "Add an RFP first." }, { status: 400 });

    const knowledge = await loadKnowledge();
    const system = `${INSTRUCTIONS}\n\n<knowledge>\n${knowledge}\n</knowledge>`;
    const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 4 }];

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
      const response = await client.messages.create({ model: MODEL, max_tokens: 8000, system, tools, messages });
      allBlocks.push(...response.content);
      if (response.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: response.content });
    }

    const text = allBlocks.filter((b) => b.type === "text").map((b) => b.text).join("");
    const match = text.match(/<result>([\s\S]*?)<\/result>/);
    if (!match) {
      return Response.json(
        { error: "The agent did not return a structured analysis. Try again." },
        { status: 502 }
      );
    }
    const analysis = JSON.parse(match[1].trim());

    const sources = [];
    for (const b of allBlocks) {
      if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) {
          if (r.url && !sources.find((s) => s.url === r.url)) sources.push({ url: r.url, title: r.title });
        }
      }
    }

    return Response.json({ analysis, sources: sources.slice(0, 10) });
  } catch (err) {
    return Response.json({ error: err.message || "Analysis failed." }, { status: 500 });
  }
}
