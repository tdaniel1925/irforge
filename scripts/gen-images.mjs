// Generates the landing-page illustration set with Imagen 4, in a consistent
// green pencil-sketch corporate style. Saves PNGs to public/img/.
// Run: node scripts/gen-images.mjs

import fs from "fs";
import path from "path";

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) {
  console.error("GEMINI_API_KEY not set");
  process.exit(1);
}

const OUT = path.join(process.cwd(), "public", "img");
fs.mkdirSync(OUT, { recursive: true });

// Shared style so every image feels like one set.
const STYLE =
  "Hand-drawn pencil sketch illustration, fine cross-hatching and confident line work, " +
  "monochromatic emerald green ink on a clean off-white paper background, subtle paper texture, " +
  "minimalist corporate editorial style, lots of negative space, elegant and premium, " +
  "centered composition. " +
  "ABSOLUTELY NO TEXT of any kind: no words, no letters, no numbers, no labels, no signage, " +
  "no writing on buildings, no captions, no speech-bubble text — speech bubbles must be EMPTY. " +
  "All surfaces blank. Pure wordless illustration only.";

const IMAGES = [
  {
    name: "hero",
    aspect: "16:9",
    prompt:
      "A confident business executive standing at a podium speaking into a microphone to a small audience, " +
      "empty blank speech bubbles and small upward chart lines rising around them, conveying a company finally having a voice. " + STYLE,
  },
  {
    name: "defend",
    aspect: "1:1",
    prompt:
      "A sturdy blank shield protecting a small plain office building, with arrows deflecting off the shield, " +
      "conveying defense and protection from attacks. The building has no signs or labels. " + STYLE,
  },
  {
    name: "grow",
    aspect: "1:1",
    prompt:
      "An upward-trending line chart growing like a plant with a few leaves, a small magnet attracting coins/people icons, " +
      "conveying growth and attracting investors. " + STYLE,
  },
  {
    name: "control",
    aspect: "1:1",
    prompt:
      "A hand giving a calm thumbs-up approval over a stack of documents with a checkmark stamp, " +
      "conveying human control and approval. " + STYLE,
  },
  {
    name: "compliance",
    aspect: "16:9",
    prompt:
      "Balanced justice scales beside a stack of legal documents and a checkmark seal, a gentle protective frame around them, " +
      "conveying trust, compliance and legal safety. " + STYLE,
  },
  {
    name: "how",
    aspect: "16:9",
    prompt:
      "A simple three-step flow: a document, an arrow to a hand tapping an approve button, an arrow to a rising chart, " +
      "left to right, conveying a clean simple process. " + STYLE,
  },
];

async function gen({ name, prompt, aspect }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: aspect },
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    console.error(`✗ ${name}: HTTP ${res.status} ${t.slice(0, 300)}`);
    return false;
  }
  const data = await res.json();
  const b64 = data?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) {
    console.error(`✗ ${name}: no image bytes returned. keys=${JSON.stringify(Object.keys(data || {}))}`);
    return false;
  }
  const file = path.join(OUT, `${name}.png`);
  fs.writeFileSync(file, Buffer.from(b64, "base64"));
  console.log(`✓ ${name} → public/img/${name}.png`);
  return true;
}

let ok = 0;
for (const img of IMAGES) {
  try {
    if (await gen(img)) ok++;
  } catch (e) {
    console.error(`✗ ${img.name}: ${e.message}`);
  }
}
console.log(`\nDone: ${ok}/${IMAGES.length} images generated.`);
