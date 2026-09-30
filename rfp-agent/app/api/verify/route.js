import { client, loadSettings, buildSystem, rfpBlock, answersText, extractTagged } from "@/lib/claude";

export const maxDuration = 300;

const OUTPUT_FORMAT = `Finish with exactly one JSON object inside <result></result> tags and nothing after it:
{
  "verdict": "Clean" | "Needs fixes",
  "issues": [
    { "claim": "the exact sentence or phrase from the draft", "problem": "why it is unsupported or wrong", "fix": "what to change it to, or [TO CONFIRM: ...]" }
  ]
}
Return an empty issues list if nothing needs fixing.`;

export async function POST(req) {
  try {
    const { rfp, analysis, answers, draft } = await req.json();
    const settings = await loadSettings();
    const system = await buildSystem("reviewer-instructions.md", OUTPUT_FORMAT);

    const response = await client.messages.create({
      model: settings.model,
      max_tokens: 6000,
      system,
      messages: [
        {
          role: "user",
          content: [
            rfpBlock(rfp),
            {
              type: "text",
              text: `<research_notes>\n${JSON.stringify(analysis, null, 2)}\n</research_notes>\n\n<bid_team_answers>\n${answersText(analysis, answers) || "(none)"}\n</bid_team_answers>\n\n<draft>\n${draft}\n</draft>\n\nFact-check the draft.`,
            },
          ],
        },
      ],
    });

    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
    const result = extractTagged(text, "result");
    if (!result) return Response.json({ error: "The fact-check did not return a result. Try again." }, { status: 502 });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message || "Fact-check failed." }, { status: 500 });
  }
}
