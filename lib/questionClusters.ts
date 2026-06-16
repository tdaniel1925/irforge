// Question clustering for the "route questions to company" feature.
//
// Groups recurring / duplicate investor questions into themes so the company can
// see, at a glance, what its shareholders keep asking — and pick the top ones to
// answer ON THE RECORD.
//
// STRICT COMPLIANCE: this module SURFACES demand only. It does NOT answer
// questions, does NOT give guidance/advice, and does NOT decide a theme is
// "material". Answering still flows through the existing pipeline
// (generatePublicAnswer + Reg FD guard + checkContent in app/api/questions/[id]/draft).
// The output here contains no answers — only themes, counts, and the IDs of the
// questions that fall under each theme.
//
// Uses claude-haiku-4-5 directly (this is a high-volume / cheap job) with a
// JSON-match parse and a deterministic keyword-grouping fallback so the feature
// works fully offline.

export interface QuestionInput {
  id: string;
  question: string;
  author: string;
  ts: string;
}

export interface QuestionCluster {
  theme: string;
  count: number;
  representativeQuestion: string;
  questionIds: string[];
}

export interface ClusterResult {
  clusters: QuestionCluster[];
  engine: "claude" | "template";
}

const MODEL = "claude-haiku-4-5";

// Direct Haiku call — cheap/high-volume path, kept local per design spec.
async function haiku(system: string, user: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.content?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

// Pull the first JSON object/array out of a model response (handles ```json fences, prose, etc).
function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  const slice = candidate.slice(start);
  try {
    return JSON.parse(slice);
  } catch {
    // Greedy trim to the last closing bracket/brace and retry.
    const end = Math.max(slice.lastIndexOf("]"), slice.lastIndexOf("}"));
    if (end === -1) return null;
    try {
      return JSON.parse(slice.slice(0, end + 1));
    } catch {
      return null;
    }
  }
}

export async function clusterQuestions(
  questions: QuestionInput[],
  companyName: string
): Promise<ClusterResult> {
  if (questions.length === 0) return { clusters: [], engine: "template" };

  const validIds = new Set(questions.map((q) => q.id));
  const byId = new Map(questions.map((q) => [q.id, q]));

  const system =
    `You group investor questions submitted to ${companyName} into recurring THEMES. ` +
    `Your only job is to cluster duplicate/related questions so the company can see what is asked most and choose what to answer on the record. ` +
    `STRICT: do NOT answer any question, do NOT give advice or guidance, do NOT judge whether a topic is material or should be disclosed. ` +
    `Return ONLY JSON: an array of objects, each {"theme": short label, "representativeQuestion": one verbatim question from the cluster, "questionIds": [ids in this cluster]}. ` +
    `Use only the exact ids provided. Order by cluster size, largest first. Return at most 8 clusters.`;

  const user =
    `Questions (id :: question):\n` +
    questions.map((q) => `${q.id} :: ${q.question}`).join("\n") +
    `\n\nReturn the JSON array only.`;

  const raw = await haiku(system, user);
  if (raw) {
    const parsed = extractJson(raw);
    if (Array.isArray(parsed)) {
      const clusters: QuestionCluster[] = [];
      for (const c of parsed as Array<Record<string, unknown>>) {
        const ids = Array.isArray(c?.questionIds)
          ? (c.questionIds as unknown[]).map(String).filter((id) => validIds.has(id))
          : [];
        if (ids.length === 0) continue;
        const theme = typeof c?.theme === "string" && c.theme.trim() ? c.theme.trim().slice(0, 80) : "Recurring questions";
        const repFromIds = byId.get(ids[0])?.question ?? "";
        const rep =
          typeof c?.representativeQuestion === "string" && c.representativeQuestion.trim()
            ? c.representativeQuestion.trim()
            : repFromIds;
        clusters.push({
          theme,
          count: ids.length,
          representativeQuestion: rep.slice(0, 300),
          questionIds: ids,
        });
      }
      if (clusters.length > 0) {
        clusters.sort((a, b) => b.count - a.count);
        return { clusters: clusters.slice(0, 8), engine: "claude" };
      }
    }
  }

  return { clusters: templateCluster(questions), engine: "template" };
}

// Deterministic fallback: naive keyword grouping. Picks the most informative
// keyword in each question and buckets by it. Pure surfacing — no judgement.
const STOPWORDS = new Set([
  "what","when","will","does","your","you","the","and","for","are","with","this","that","have","has",
  "any","can","how","why","who","whom","about","into","from","they","their","there","were","was","our",
  "out","not","but","all","get","got","its","it's","is","be","do","of","to","in","on","a","an","or",
  "we","us","i","my","me","as","at","by","if","so","up","go","new","more","plan","plans","planning",
  "company","ticker","stock","shares","share","price","question","please","could","would","should",
]);

function keywordsOf(q: string): string[] {
  return q
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function templateCluster(questions: QuestionInput[]): QuestionCluster[] {
  // Bucket each question under its first non-stopword keyword.
  const buckets = new Map<string, QuestionInput[]>();
  for (const q of questions) {
    const kw = keywordsOf(q.question)[0] ?? "general";
    const arr = buckets.get(kw) ?? [];
    arr.push(q);
    buckets.set(kw, arr);
  }

  const clusters: QuestionCluster[] = Array.from(buckets.entries()).map(([kw, qs]) => ({
    theme: kw.charAt(0).toUpperCase() + kw.slice(1),
    count: qs.length,
    representativeQuestion: qs[0].question.slice(0, 300),
    questionIds: qs.map((q) => q.id),
  }));

  clusters.sort((a, b) => b.count - a.count);
  return clusters.slice(0, 8);
}
