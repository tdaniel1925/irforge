// Plain-language help articles — written so a first-time small-cap operator (or a
// 5th-grader) can understand them. One entry per major feature. Keyed by slug so
// tooltips (the sidebar ⓘ) can deep-link straight to the matching article.

export interface HelpArticle {
  slug: string;
  title: string;
  icon: string;
  forWho: string;          // "Everyone" | "Admins" | "Counsel" ...
  summary: string;         // one plain sentence
  body: string[];          // paragraphs, plain English
  related?: string[];      // other slugs
  href?: string;           // the in-app feature this explains
}

export const HELP: HelpArticle[] = [
  {
    slug: "getting-started",
    title: "Getting started",
    icon: "🚀",
    forWho: "Everyone",
    summary: "How to set up your company and what to do first.",
    href: "/setup",
    body: [
      "Think of PubcoZone as one place to talk to your investors — safely. You write nothing risky by accident, because nothing goes out until a real person taps approve.",
      "First, connect your stock ticker. We pull your public company info automatically and even draft your first few posts.",
      "Then the Get started checklist shows what's left: who approves posts, your legal wording, connecting your social accounts, and inviting your team. It checks each item off by itself as you finish.",
    ],
    related: ["approvals", "team", "settings"],
  },
  {
    slug: "approvals",
    title: "Approving posts (Home)",
    icon: "🏠",
    forWho: "Everyone",
    summary: "Your inbox of drafts — read, then approve, edit, or skip.",
    href: "/app",
    body: [
      "Home is your inbox. The AI writes posts for you; you decide what actually gets published.",
      "For each one: tap Approve to let it go out, Edit to change the words, or Skip to throw it away. Nothing is ever posted without you.",
      "When you approve, your legal disclosures (the small print) get added automatically — you can't forget them.",
    ],
    related: ["content-pipeline", "counsel"],
  },
  {
    slug: "content-pipeline",
    title: "Content Pipeline",
    icon: "🧩",
    forWho: "Everyone",
    summary: "Turn a topic or filing into a ready-to-post update.",
    href: "/calendar-os",
    body: [
      "Type what you want to talk about, and the AI writes it in your executive's voice.",
      "Before it can post, it runs a quick safety check (we call it the Reg FD check) that flags anything that might be sensitive — green means routine, red means a lawyer should look first.",
      "Approve it, schedule it, and it publishes to your connected social accounts.",
    ],
    related: ["approvals", "voices", "counsel"],
  },
  {
    slug: "counsel",
    title: "Counsel Console",
    icon: "⚖️",
    forWho: "Admins & Counsel",
    summary: "Where your lawyer signs off on anything sensitive.",
    href: "/counsel",
    body: [
      "Some posts might share market-moving news. Those get flagged red and sent here for your lawyer to review.",
      "Your lawyer reads it and signs off with one click. We keep a tamper-proof record (a digital fingerprint) of who approved what and when — the kind of paper trail lawyers want.",
      "Nothing flagged red can publish until that sign-off happens.",
    ],
    related: ["approvals", "content-pipeline"],
  },
  {
    slug: "crm",
    title: "CRM & Investor Inbox",
    icon: "👥",
    forWho: "Everyone",
    summary: "Track every investor contact, and answer inbound messages.",
    href: "/crm",
    body: [
      "Keep all your investor contacts, the firms they work at, deals, and follow-up tasks in one place — like a contact book built for investor relations.",
      "Your whole team shares the same contacts; each contact has an owner, and you can flip between 'everyone's' and 'mine.'",
      "In the Investor Inbox, paste any message you get and the AI suggests who it's from and drafts a reply — using only your public info — that you review before sending.",
    ],
    related: ["find-investors"],
  },
  {
    slug: "find-investors",
    title: "Find Investors",
    icon: "🎯",
    forWho: "Everyone",
    summary: "Real funds that hold companies like yours, with contact paths.",
    href: "/investors",
    body: [
      "We look at public records (13F filings — the reports big funds must file about what they own) to find funds that already hold companies similar to yours.",
      "For each one you get the fund's name, address, and a link to find their contact, plus a ready-to-personalize intro note.",
      "These are starting points to research — confirm the details before you reach out. You do the outreach; we just hand you the leads.",
    ],
    related: ["crm"],
  },
  {
    slug: "defend",
    title: "Defend Your Name",
    icon: "🛡",
    forWho: "Everyone",
    summary: "Spot attacks on your stock and respond with the facts.",
    href: "/company",
    body: [
      "The internet is full of anonymous posts about small companies — some false. We watch for attacks and misinformation about you.",
      "When something needs a response, the AI drafts a calm, fact-based reply that cites your real filings — ready for you to approve.",
      "You also get a Visibility Score: a single number that tracks how well-known and well-covered your company is, so you can show progress.",
    ],
    related: ["approvals", "results"],
  },
  {
    slug: "results",
    title: "Results & Analytics",
    icon: "📈",
    forWho: "Everyone",
    summary: "The numbers to prove your IR program is working.",
    href: "/proof",
    body: [
      "See what you've shipped, your Visibility Score over time, and a complete record of who approved what.",
      "It's built to screenshot for your board — proof the money you spend on investor relations is doing something.",
    ],
    related: ["defend"],
  },
  {
    slug: "team",
    title: "Team",
    icon: "👤",
    forWho: "Admins",
    summary: "Invite teammates as admins or members.",
    href: "/admin/team",
    body: [
      "Add people to your company account. Admins can change settings and manage users; members use the dashboard and get their own private workspace.",
      "Invite by email — they click the link, sign in, and they're in. Everyone shares the company's data; each person's private notes stay private.",
    ],
    related: ["settings", "workspace"],
  },
  {
    slug: "settings",
    title: "Settings",
    icon: "⚙",
    forWho: "Admins",
    summary: "Company profile, social accounts, and legal wording.",
    href: "/settings",
    body: [
      "Your company details, the legal disclosure text that gets added to every post, and where you connect your social accounts so approved posts can publish.",
      "Quiet mode is here too — one switch that pauses all publishing around earnings or big announcements.",
    ],
    related: ["team", "getting-started"],
  },
  {
    slug: "workspace",
    title: "My Workspace",
    icon: "🗒",
    forWho: "Everyone",
    summary: "Your private notes — only you can see them.",
    href: "/workspace",
    body: [
      "A private scratchpad inside your company account: call notes, reminders, drafts.",
      "Only you can see these — not teammates, not admins. Separate from the shared company data.",
    ],
    related: ["crm"],
  },
  {
    slug: "public-page",
    title: "Your Public Page",
    icon: "🌐",
    forWho: "Everyone",
    summary: "What investors see when they look you up.",
    href: "/t",
    body: [
      "A clean, trustworthy page for your stock: real filings, financials, and a place where investors can ask you questions and get answers on the record.",
      "When you answer a question, it's marked as a verified company answer so people know it's really you.",
    ],
    related: ["approvals", "embeds"],
  },
];

export function getArticle(slug: string): HelpArticle | undefined {
  return HELP.find((a) => a.slug === slug);
}
