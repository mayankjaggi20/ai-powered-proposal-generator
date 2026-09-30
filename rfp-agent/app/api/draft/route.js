import { client, MODEL, loadKnowledge, rfpBlock } from "@/lib/claude";

export const maxDuration = 300;

const INSTRUCTIONS = `You are the proposal writer for our company. You write a complete first-draft proposal responding to the RFP.

Sources you may use:
- The RFP itself.
- <knowledge>: our internal knowledge base. The only source of truth about our company.
- The analysis and web research prepared earlier.
- The bid team's answers to your questions.

Rules:
- Follow the RFP's required response structure and section order exactly.
- Address every requirement. Speak to the client's situation using the research, not generic claims.
- Never invent facts about our company: no made-up clients, case studies, numbers, certifications, names or prices. Where something is missing, write [TO CONFIRM: what is needed] and move on.
- Be specific, confident and concise. Lead each section with the benefit to the client. No filler.
- Output plain text only. No markdown symbols such as #, *, or tables. Use numbered section headings like "1. Executive Summary" on their own lines, and simple dashes for lists where needed.

After the proposal, add a final section titled "COMPLIANCE CHECK" that lists every requirement ID with the section that addresses it, or "GAP" with a one-line note.`;

export async function POST(req) {
  const { rfp, analysis, answers } = await req.json();

  const knowledge = await loadKnowledge();
  const system = `${INSTRUCTIONS}\n\n<knowledge>\n${knowledge}\n</knowledge>`;

  const answerText = (analysis?.questions || [])
    .map((q) => `${q.id}. ${q.question}\nAnswer: ${answers?.[q.id]?.trim() || "(no answer, mark as TO CONFIRM)"}`)
    .join("\n\n");

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system,
    messages: [
      {
        role: "user",
        content: [
          rfpBlock(rfp),
          {
            type: "text",
            text: `<analysis>\n${JSON.stringify(analysis, null, 2)}\n</analysis>\n\n<bid_team_answers>\n${answerText || "(no questions asked)"}\n</bid_team_answers>\n\nWrite the full proposal now.`,
          },
        ],
      },
    ],
  });

  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      stream.on("text", (t) => controller.enqueue(encoder.encode(t)));
      try {
        await stream.finalMessage();
      } catch (err) {
        controller.enqueue(encoder.encode(`\n\n[Drafting stopped: ${err.message}]`));
      }
      controller.close();
    },
  });

  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
