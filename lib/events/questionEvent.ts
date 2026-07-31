import { emitEvent } from "./emit";

// Fire an `investor_question_received` event for a new board question. Kept LEAN
// on purpose: it runs in the hot path of an investor posting a question, so it
// does NOT draft an answer inline (that pulls the AI stack + the full company
// record). The receiver (Jordyn) has the gateway tools to fetch a compliant
// suggested answer on demand — the event just says "a question arrived, here it
// is, here's where to act."
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://pubcozone.com";

export async function emitQuestionEvent(input: { companyId: string; ticker: string; author: string; question: string }): Promise<void> {
  await emitEvent({
    type: "investor_question_received",
    companyId: input.companyId,
    ticker: input.ticker,
    data: {
      author: input.author,
      question: input.question,
      // Deep link straight to the company's board/answer screen.
      deepLink: `${SITE}/company`,
      publicBoardLink: `${SITE}/t/${input.ticker}`,
    },
  });
}
