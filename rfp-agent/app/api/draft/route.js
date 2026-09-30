import { client, loadSettings, buildSystem, rfpBlock, answersText } from "@/lib/claude";

export const maxDuration = 300;

export async function POST(req) {
  const { rfp, analysis, answers } = await req.json();
  const settings = await loadSettings();
  const system = await buildSystem("writer-instructions.md");

  const stream = client.messages.stream({
    model: settings.model,
    max_tokens: 16000,
    system,
    messages: [
      {
        role: "user",
        content: [
          rfpBlock(rfp),
          {
            type: "text",
            text: `<analysis>\n${JSON.stringify(analysis, null, 2)}\n</analysis>\n\n<bid_team_answers>\n${answersText(analysis, answers) || "(no questions asked)"}\n</bid_team_answers>\n\nWrite the full proposal now.`,
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
