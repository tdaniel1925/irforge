"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAppState } from "@/components/useAppState";
import { Button, Card, ErrorBanner, LoadingState, PageHeader } from "@/components/ui";
import VoiceManager from "@/components/VoiceManager";

// Social Media Setup — the single home for everything that helps the AI post on-brand:
// logo, colors, image style (with live samples), voice, compliance, and free-form
// guidance. Accordion = guided, step-by-step setup. Admin-only edits.

const IMAGE_STYLES = [
  { key: "cinematic", label: "Cinematic / 3D", desc: "Dramatic lighting, premium hero-shot feel" },
  { key: "infographic", label: "Infographic / tech-report", desc: "Clean vector, icons, isometric tech" },
  { key: "illustration", label: "Editorial illustration", desc: "Bold shapes, magazine-cover polish" },
  { key: "photographic", label: "Photographic", desc: "Realistic, naturally lit, editorial" },
  { key: "minimal", label: "Minimal abstract", desc: "Flowing forms, lots of negative space" },
];

type SectionKey = "basics" | "logo" | "style" | "accounts" | "voice" | "compliance" | "guidance";

export default function SocialSetupPage() {
  const { db, error, act } = useAppState();
  const [open, setOpen] = useState<SectionKey>("logo");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");

  // editable fields (mirrored from company)
  const [brandColors, setBrandColors] = useState("");
  const [imageStyle, setImageStyle] = useState("cinematic");
  const [guidance, setGuidance] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // sample image
  const [sampleUrl, setSampleUrl] = useState("");
  const [sampleBusy, setSampleBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [voices, setVoices] = useState<unknown[] | null>(null);

  // Voices load lazily for the Voice & tone accordion.
  useEffect(() => {
    fetch("/api/iros/voices").then((r) => r.json()).then((d) => setVoices(Array.isArray(d?.voices) ? d.voices : Array.isArray(d) ? d : [])).catch(() => setVoices([]));
  }, []);

  useEffect(() => {
    if (db && !loaded) {
      const c = db.company as { brandColors?: string; imageStyle?: string; postGuidance?: string; logoUrl?: string };
      setBrandColors(c.brandColors ?? "");
      setImageStyle(c.imageStyle || "cinematic");
      setGuidance(c.postGuidance ?? "");
      setLogoUrl(c.logoUrl ?? "");
      setLoaded(true);
    }
  }, [db, loaded]);

  if (error) return <ErrorBanner message={error} />;
  if (!db) return <LoadingState />;

  const isAdmin = (db as { role?: string }).role !== "member";

  const save = async (patch: Record<string, unknown>, msg = "Saved.") => {
    // These brand fields are preserved-if-blank server-side (an empty save won't
    // overwrite the saved value). Catch it here so the user gets honest feedback
    // instead of a misleading "Saved." that quietly did nothing.
    const PRESERVE_IF_BLANK = ["brandColors", "postGuidance", "imageStyle"];
    const blanked = Object.entries(patch).filter(
      ([k, v]) => PRESERVE_IF_BLANK.includes(k) && (typeof v !== "string" || v.trim() === "")
    );
    if (blanked.length > 0 && Object.keys(patch).length === blanked.length) {
      setNotice("Nothing to save — that field is empty, so your saved value is kept. (Empty entries don't overwrite your brand settings.)");
      return;
    }
    setSaving(true); setNotice("");
    const err = await act("/api/company", "PUT", patch);
    setNotice(err ? err : msg);
    setSaving(false);
  };

  const uploadLogo = async (file: File) => {
    setNotice("");
    const fd = new FormData(); fd.append("file", file);
    const r = await fetch("/api/company/logo", { method: "POST", body: fd });
    const d = await r.json();
    if (!r.ok) { setNotice(d.error ?? "Upload failed."); return; }
    setLogoUrl(d.logoUrl);
    setNotice("Logo uploaded.");
  };

  const generateSample = async () => {
    setSampleBusy(true); setNotice("");
    try {
      // Save the style first so the sample uses it, then generate.
      await act("/api/company", "PUT", { imageStyle, brandColors, postGuidance: guidance });
      const r = await fetch("/api/social/quickpost/media", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ generate: true, text: `${db.company.name} shares an exciting company update` }),
      });
      const d = await r.json();
      if (!r.ok) { setNotice(d.error ?? "Couldn't generate a sample."); return; }
      setSampleUrl(d.url);
    } finally {
      setSampleBusy(false);
    }
  };

  const Section = ({ id, icon, title, sub, children }: { id: SectionKey; icon: string; title: string; sub: string; children: React.ReactNode }) => (
    <Card className="mb-3 p-0">
      <button onClick={() => setOpen(open === id ? ("" as SectionKey) : id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <span>
            <span className="block text-sm font-semibold text-app">{title}</span>
            <span className="block text-xs text-muted">{sub}</span>
          </span>
        </span>
        <span className={`text-muted transition-transform ${open === id ? "" : "-rotate-90"}`}>⌄</span>
      </button>
      {open === id && <div className="border-t border-app px-4 py-4">{children}</div>}
    </Card>
  );

  return (
    <div className="max-w-3xl">
      <PageHeader title="Social Media Setup" subtitle="Set your brand once — logo, colors, image style, voice, and guidance — and every AI-generated post and image stays on-brand. Still fully compliance-checked." />
      {!isAdmin && <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">You&apos;re a team member — this brand setup is view-only.</div>}
      {notice && <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</div>}

      <Section id="basics" icon="🏢" title="Brand basics" sub="Name, ticker, sector — from onboarding">
        <p className="text-sm text-muted">
          <strong className="text-app">{db.company.name}</strong> (${db.company.ticker}) · {db.company.sector || "—"}
        </p>
        <p className="mt-1 text-xs text-faint">Edit these in <Link href="/settings" className="text-emerald-600 underline dark:text-emerald-400">Settings</Link>. They ground every post and image.</p>
      </Section>

      <Section id="logo" icon="🎨" title="Logo & colors" sub="Upload your logo + set brand colors">
        <div className="flex items-center gap-4">
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt="logo" className="h-16 w-16 rounded-lg border border-app object-contain bg-surface-2 p-1" />
            : <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-app text-2xl text-faint">🏷️</div>}
          <div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); e.target.value = ""; }} />
            <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={!isAdmin}>Upload logo</Button>
            <p className="mt-1 text-[11px] text-faint">PNG/JPG/WebP/SVG. Used as your brand reference + post avatar. (Not baked into AI images — those garble logos — but your colors + style are.)</p>
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1 block text-xs font-medium text-muted">Brand colors</label>
          <input value={brandColors} onChange={(e) => setBrandColors(e.target.value)} disabled={!isAdmin} placeholder="e.g. navy blue and red" className="w-full max-w-md rounded-lg border border-app bg-surface-2 px-3 py-2 text-sm text-app focus:border-emerald-500 focus:outline-none" />
          <div className="mt-2"><Button onClick={() => save({ brandColors })} disabled={saving || !isAdmin}>Save colors</Button></div>
        </div>
      </Section>

      <Section id="style" icon="🖼️" title="Image style" sub="Pick the look for all your AI images">
        <div className="grid gap-2 sm:grid-cols-2">
          {IMAGE_STYLES.map((s) => (
            <button key={s.key} onClick={() => isAdmin && setImageStyle(s.key)} disabled={!isAdmin}
              className={`rounded-lg border px-3 py-2 text-left text-sm transition ${imageStyle === s.key ? "border-emerald-500/60 bg-emerald-500/10 text-app" : "border-app bg-surface-2/40 text-muted hover:bg-app-hover"}`}>
              <span className="block font-medium text-app">{s.label}{imageStyle === s.key && " ✓"}</span>
              <span className="block text-xs text-muted">{s.desc}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => save({ imageStyle })} disabled={saving || !isAdmin}>Save style</Button>
          <Button variant="ghost" onClick={generateSample} disabled={sampleBusy || !isAdmin}>{sampleBusy ? "Generating…" : "✨ Generate a sample"}</Button>
        </div>
        {sampleUrl && (
          <div className="mt-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sampleUrl} alt="sample" className="h-48 w-48 rounded-lg border border-app object-cover" />
            <p className="mt-1 text-[11px] text-faint">A sample post image in your chosen style. Click again for a fresh take.</p>
          </div>
        )}
      </Section>

      <Section id="accounts" icon="🔌" title="Connected accounts" sub="Where approved posts publish">
        <p className="text-sm text-muted">Connect and test your social accounts in <Link href="/settings" className="text-emerald-600 underline dark:text-emerald-400">Settings → Your social accounts</Link>.</p>
      </Section>

      <Section id="voice" icon="✍️" title="Voice & tone" sub="Teach the AI how your leaders sound">
        {voices === null ? <p className="text-sm text-faint">Loading voices…</p> : <VoiceManager initial={voices as never} />}
      </Section>

      <Section id="compliance" icon="⚖️" title="Compliance & disclosures" sub="Auto-attached to every post">
        <p className="text-sm text-muted">Your forward-looking-statements note and disclosures are added to every published post automatically — edit them in <Link href="/settings" className="text-emerald-600 underline dark:text-emerald-400">Settings</Link>.</p>
        <ul className="mt-2 space-y-1 text-xs text-muted">
          <li>✓ We never generate stock-price predictions, valuations, or guarantees.</li>
          <li>✓ Risky posts are flagged for Reg FD review before they can publish.</li>
          <li>✓ Nothing publishes without your approval.</li>
        </ul>
      </Section>

      <Section id="guidance" icon="📋" title="Extra guidance for the AI" sub="Anything that helps us post on-brand">
        <textarea value={guidance} onChange={(e) => setGuidance(e.target.value)} disabled={!isAdmin} rows={4} placeholder="e.g. Key products: X, Y. Audience: retail + institutional investors. Always emphasize safety & innovation. Avoid hype words." className="w-full rounded-lg border border-app bg-surface-2 p-3 text-sm text-app focus:border-emerald-500 focus:outline-none" />
        <p className="mt-1 text-[11px] text-faint">Injected into post + image prompts as grounding (still subject to all compliance rules).</p>
        <div className="mt-2"><Button onClick={() => save({ postGuidance: guidance })} disabled={saving || !isAdmin}>Save guidance</Button></div>
      </Section>
    </div>
  );
}
