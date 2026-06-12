"use client";

import { useState } from "react";
import { PageHeader } from "@/components/ui";

const GUIDES = [
  {
    q: "What is an 8-K, and when do I have to file one?",
    a: "An 8-K is the SEC's \"current report\" — it tells investors about a material event between your quarterly filings, usually within four business days. Common triggers: signing or ending a material agreement (Item 1.01/1.02), earnings (2.02), selling unregistered shares (3.02), a director or officer change (5.02), and Reg FD disclosures (7.01). The rule of thumb: if a reasonable investor would want to know before they trade, it's probably 8-K territory. When in doubt, the Disclosure Helper drafts starter language and you confirm with counsel.",
  },
  {
    q: "What is Regulation FD, and why can't I just answer an investor's question?",
    a: "Reg FD (Fair Disclosure) says you can't selectively share material non-public information — if you tell one investor something market-moving, you've broken the rule unless everyone gets it at the same time. That's why companies stay silent on message boards. The workaround the SEC blessed in 2013: social media counts as fair disclosure if you've told investors where to look. IRForge uses that — answers publish to your page and X simultaneously, so it's broad public disclosure, not a private tip.",
  },
  {
    q: "What is short interest, and should I worry about it?",
    a: "Short interest is the number of shares sold short — bets your price will fall. \"Days to cover\" is short interest divided by average daily volume; high numbers can mean either real skepticism or a crowded trade that could squeeze. Daily short VOLUME (what FINRA publishes every day) is different and includes routine market-making, so 40-50% is normal — don't panic at the daily number. The bi-monthly short INTEREST is the one that matters. Rising short interest with a quiet narrative is a signal to get your facts out there.",
  },
  {
    q: "What actually moves a micro-cap stock?",
    a: "For small companies, it's rarely fundamentals alone — it's attention converting into liquidity. The chain: visibility → retail trading volume → liquidity → a stabler, higher price → better terms on your next raise. A company doing a financing that prices 10% better because there's real volume saves enormous dilution. That's why a silent ticker is a dying ticker, and why consistent, compliant communication is worth more than it looks.",
  },
  {
    q: "What is a quiet period?",
    a: "A quiet period is a window — typically around earnings or a securities offering — when you limit what you say publicly to avoid selectively disclosing or hyping ahead of material news. There's no single legal definition for the earnings blackout (it's best practice, usually ~2 weeks before through the release), but offering-related quiet periods are stricter and rule-driven. IRForge's quiet mode locks publishing during these windows; the IR Calendar schedules it automatically when you add an earnings date.",
  },
  {
    q: "What does an investor relations program actually do?",
    a: "Good IR does five things: (1) gets your news out fast and clearly, (2) keeps your story visible between announcements so you don't go dark, (3) answers shareholders and corrects misinformation, (4) targets the right institutional investors, and (5) proves to your board that it's working. Agencies charge $5-15k/month to do this with humans. The point of IRForge is to do the same jobs at software speed and price — with you approving everything.",
  },
  {
    q: "What's the difference between Section 17(b) and disclosure?",
    a: "Section 17(b) of the Securities Act is the anti-touting rule: anyone PAID to promote a security must clearly disclose that they're compensated, by whom, and how much. It's the most common charge against stock promoters. This is why every post IRForge publishes carries a disclosure that the account is run by a compensated service provider — it's not optional, it's the law, and doing it right is what separates a legitimate IR program from a pump scheme.",
  },
];

export default function Learn() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Public Company 101" subtitle="Plain-English answers to the questions every public-company team has — about filings, disclosure rules, short interest, and running a real IR program. No legalese." />
      <div className="space-y-3">
        {GUIDES.map((g, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-app bg-surface">
            <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
              <span className="text-sm font-medium text-app">{g.q}</span>
              <span className="shrink-0 text-faint">{open === i ? "−" : "+"}</span>
            </button>
            {open === i && <p className="border-t border-app px-5 py-4 text-sm leading-relaxed text-muted">{g.a}</p>}
          </div>
        ))}
      </div>
      <p className="mt-6 text-xs text-faint">Educational only, not legal or investment advice. Confirm anything that affects your filings or disclosures with your securities counsel.</p>
    </div>
  );
}
