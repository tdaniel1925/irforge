"use client";

import { useState } from "react";

interface Strategy {
  id: string;
  goals: string;
  audience: string;
  tone: string;
  themes: string[];
  platforms: string[];
  postsPerWeek: number;
  dos: string[];
  donts: string[];
  voiceProfileId: string | null;
  interviewComplete: boolean;
}

interface Channel { key: string; label: string }

const BLANK: Strategy = {
  id: "", goals: "", audience: "", tone: "professional", themes: [],
  platforms: ["twitter", "linkedin"], postsPerWeek: 3, dos: [], donts: [],
  voiceProfileId: null, interviewComplete: false,
};

// A comma/newline list editor that round-trips string[] <-> textarea.
function ListField({ label, value, onChange, placeholder }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <textarea
        className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm"
        rows={3}
        placeholder={placeholder}
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))}
      />
    </label>
  );
}

export default function SocialEngine({ initialStrategy, channels }: { initialStrategy: Strategy | null; channels: Channel[] }) {
  const [strategy, setStrategy] = useState<Strategy>(initialStrategy ?? BLANK);
  // "interview" = answering questions; "review" = editing the proposed/saved strategy.
  const [stage, setStage] = useState<"interview" | "review">(initialStrategy?.interviewComplete ? "review" : "interview");
  const [interview, setInterview] = useState({ goals: "", audience: "", tone: "professional", frequency: "3 posts/week", topics: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const patch = (p: Partial<Strategy>) => setStrategy((s) => ({ ...s, ...p }));

  const togglePlatform = (key: string) =>
    patch({ platforms: strategy.platforms.includes(key) ? strategy.platforms.filter((p) => p !== key) : [...strategy.platforms, key] });

  // Send interview answers → AI proposal → prefill the editable strategy.
  const propose = async () => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/social/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(interview),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't build a strategy.");
      const p = data.proposal;
      patch({
        goals: p.goals, audience: p.audience, tone: p.tone, themes: p.themes,
        dos: p.dos, donts: p.donts, postsPerWeek: p.postsPerWeek,
      });
      setStage("review");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  const save = async (markComplete: boolean) => {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/social/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...strategy, interviewComplete: markComplete || strategy.interviewComplete }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't save.");
      setStrategy(data.strategy);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "interview") {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Let&apos;s set up your content</h2>
          <p className="mt-1 text-sm text-gray-600">Answer a few questions. The AI uses these plus your filings and company profile to plan your calendar. You can edit everything before anything is generated.</p>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">What do you want from social? (goals)</span>
              <textarea className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" rows={2} placeholder="e.g. Build awareness with retail investors and keep current shareholders informed." value={interview.goals} onChange={(e) => setInterview({ ...interview, goals: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Who&apos;s your audience?</span>
              <input className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" placeholder="e.g. Retail shareholders, prospective institutional investors" value={interview.audience} onChange={(e) => setInterview({ ...interview, audience: e.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Tone</span>
                <input className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" placeholder="professional, plain-spoken…" value={interview.tone} onChange={(e) => setInterview({ ...interview, tone: e.target.value })} />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">How often?</span>
                <input className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" placeholder="e.g. 3 posts/week" value={interview.frequency} onChange={(e) => setInterview({ ...interview, frequency: e.target.value })} />
              </label>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Topics you want to cover</span>
              <textarea className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" rows={2} placeholder="e.g. New filings explained, milestones, sector education, team spotlights" value={interview.topics} onChange={(e) => setInterview({ ...interview, topics: e.target.value })} />
            </label>
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button disabled={busy} onClick={propose} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Building your strategy…" : "Build my strategy →"}
            </button>
            {initialStrategy && (
              <button disabled={busy} onClick={() => setStage("review")} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">Skip — edit saved strategy</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Review / edit stage
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your content strategy</h2>
          <button onClick={() => setStage("interview")} className="text-sm text-indigo-600">Redo interview</button>
        </div>
        <p className="mt-1 text-sm text-gray-600">Edit anything here. This drives every post the AI plans and writes.</p>

        <div className="mt-4 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Goals</span>
            <textarea className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" rows={2} value={strategy.goals} onChange={(e) => patch({ goals: e.target.value })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Audience</span>
              <input className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" value={strategy.audience} onChange={(e) => patch({ audience: e.target.value })} />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Tone</span>
              <input className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" value={strategy.tone} onChange={(e) => patch({ tone: e.target.value })} />
            </label>
          </div>

          <ListField label="Content themes (one per line)" value={strategy.themes} onChange={(v) => patch({ themes: v })} placeholder="Filing highlights&#10;Company explainers&#10;Sector education" />
          <div className="grid grid-cols-2 gap-3">
            <ListField label="Always do (one per line)" value={strategy.dos} onChange={(v) => patch({ dos: v })} />
            <ListField label="Never do (one per line)" value={strategy.donts} onChange={(v) => patch({ donts: v })} />
          </div>

          <div>
            <span className="text-sm font-medium text-gray-700">Platforms to publish to</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {channels.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => togglePlatform(c.key)}
                  className={`rounded-full border px-3 py-1 text-sm ${strategy.platforms.includes(c.key) ? "border-indigo-600 bg-indigo-50 text-indigo-700" : "border-gray-300 text-gray-600"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <label className="block w-40">
            <span className="text-sm font-medium text-gray-700">Posts per week</span>
            <input type="number" min={1} max={21} className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm" value={strategy.postsPerWeek} onChange={(e) => patch({ postsPerWeek: Number(e.target.value) || 1 })} />
          </label>
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-5 flex items-center gap-2">
          <button disabled={busy} onClick={() => save(true)} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy ? "Saving…" : strategy.interviewComplete ? "Save changes" : "Save strategy"}
          </button>
          {strategy.id && <span className="text-sm text-green-600">Saved ✓</span>}
        </div>
      </div>

      {/* Step 2 will turn this into a live calendar generator. */}
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5 text-sm text-gray-600">
        <p className="font-medium text-gray-800">Next: generate your calendar</p>
        <p className="mt-1">Once your strategy is saved, the AI will plan a month of posts from your filings and these settings — then draft and image each one for bulk review. (Coming in the next step.)</p>
      </div>
    </div>
  );
}
