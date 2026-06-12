// Public Company Playbook — in-depth, plain-English guides grounded in real SEC,
// exchange, and FINRA rules. Each article links to the authoritative primary source.
// Educational only; "confirm with counsel" posture throughout.

export interface Source {
  label: string;
  url: string;
}

export interface Article {
  id: string;
  title: string;
  summary: string;
  body: string[]; // paragraphs
  checklist?: string[];
  sources: Source[];
}

export interface Track {
  key: string;
  title: string;
  blurb: string;
  articles: Article[];
}

export const TRACKS: Track[] = [
  {
    key: "disclosure",
    title: "Your Disclosure Obligations",
    blurb: "What you must tell investors, when, and how — the rules that keep you out of trouble.",
    articles: [
      {
        id: "form-8k",
        title: "The 8-K: your real-time disclosure obligation",
        summary: "When material events happen between quarters, the 8-K is how you tell the market — usually within four business days.",
        body: [
          "A Form 8-K is the SEC's 'current report' — the filing that announces a material corporate event in between your scheduled quarterly (10-Q) and annual (10-K) reports. The governing principle is timeliness: if something happens that a reasonable investor would want to know before trading your stock, the 8-K is how you disclose it, and you generally have four business days from the triggering event to file.",
          "The form is organized into numbered items, each covering a category of event. The ones small companies hit most often: Item 1.01 (entry into a material definitive agreement) and 1.02 (termination of one); Item 2.02 (results of operations and financial condition — i.e., earnings); Item 3.02 (unregistered sales of equity securities, which matters for private placements and convertible notes); Item 5.02 (departure or appointment of directors and officers); Item 7.01 (Regulation FD disclosure); and Item 8.01 (other events — the catch-all for anything material that doesn't fit a specific item).",
          "Two practical traps. First, materiality is a judgment call, not a checklist — when in doubt, the safer path is usually to disclose, and to confirm with securities counsel. Second, the four-business-day clock starts at the triggering event (for example, signing the agreement), not when you get around to drafting. Missing the window is a reporting deficiency that can affect your filing status and, in serious cases, your listing.",
          "A well-run 8-K process pairs the legal filing with a plain-English announcement to investors. The filing satisfies the law; the announcement is how the market actually hears the news. PubcoZone's disclosure helper drafts both — but the materiality and timing call is always yours and your counsel's.",
        ],
        checklist: [
          "Identify the triggering event and the exact date it occurred",
          "Match it to the right item number (1.01, 5.02, 8.01, etc.)",
          "Confirm materiality and the 4-business-day deadline with counsel",
          "File the 8-K, then announce it to investors in plain language",
        ],
        sources: [
          { label: "SEC — Form 8-K (current report)", url: "https://www.sec.gov/about/forms/form8-k.pdf" },
          { label: "SEC — Exchange Act Form 8-K C&DIs (staff guidance)", url: "https://www.sec.gov/rules-regulations/staff-guidance/compliance-disclosure-interpretations/exchange-act-form-8-k" },
        ],
      },
      {
        id: "reg-fd",
        title: "Regulation FD: why you can't just answer one investor",
        summary: "Tell one investor something material and you must tell everyone — at the same time. This is why companies go silent.",
        body: [
          "Regulation FD ('Fair Disclosure'), adopted in 2000, addresses selective disclosure: the practice of sharing material non-public information with analysts or favored investors before the broad market. The rule is simple in spirit — if you disclose material non-public information to certain people (analysts, institutional holders), you must disclose it to everyone, publicly.",
          "Timing depends on intent. If the selective disclosure was intentional, the public disclosure must be simultaneous. If it was accidental (someone let something slip on a call), you must make public disclosure promptly — generally within 24 hours or before the next market open, whichever is later.",
          "What counts as 'public' disclosure has evolved. A Form 8-K filing works. A widely distributed press release works. And — critically for modern IR — the SEC confirmed in 2013 (the Netflix/Reed Hastings matter) that social media can satisfy Reg FD, provided investors have been told in advance which channels the company uses for disclosure. This is the legal foundation that lets a company answer shareholders on X: because the answer is broadly disseminated through a pre-announced channel, it's public disclosure, not a selective tip.",
          "The practical takeaway: you can't have a quiet side conversation about material information. Either it's public or it stays inside. This is exactly why companies stay silent on message boards — and why a compliant system that publishes answers to everyone at once is the only safe way to engage.",
        ],
        checklist: [
          "Never share material non-public info selectively (analysts, big holders)",
          "If you must disclose, disclose to everyone at the same time",
          "Designate your disclosure channels (8-K, press release, your X account) and tell investors",
          "Treat any accidental slip as requiring prompt public correction",
        ],
        sources: [
          { label: "SEC — Final Rule: Regulation FD (Release 33-7881)", url: "https://www.sec.gov/rules/final/33-7881.htm" },
          { label: "SEC — Report on Netflix / social-media disclosure (2013)", url: "https://www.sec.gov/litigation/investreport/34-69279.htm" },
        ],
      },
      {
        id: "10k-10q",
        title: "The 10-K and 10-Q: your periodic reports, decoded",
        summary: "The annual and quarterly reports are the backbone of your public record. Here's what's in them and why they matter.",
        body: [
          "The 10-K is your comprehensive annual report to the SEC — far more detailed than the glossy report you mail shareholders. It contains your audited financial statements, a description of the business, risk factors, management's discussion and analysis (MD&A), legal proceedings, and details on controls and corporate governance. Smaller reporting companies get some scaled-back requirements, but the core is the same.",
          "The 10-Q is the quarterly version — unaudited financials and a lighter MD&A, filed for the first three quarters of the year (the fourth quarter is folded into the 10-K). Deadlines depend on your filer status: larger 'accelerated filers' have tighter windows than smaller companies, but a typical small-cap files its 10-Q within 45 days of quarter-end and its 10-K within 90 days of year-end.",
          "Why these matter for IR: they are the primary public record investors and your own AI tools draw from. Every compliant statement you make about cash, runway, revenue, or risk should trace back to these filings. They're also where the MD&A lets you tell your story in your own words within the guardrails — a genuinely underused tool for small companies.",
          "Late or deficient periodic filings are serious. They can trigger a 'non-current' status that freezes your ability to raise capital efficiently and, on an exchange, can start a delisting clock. Treat the filing calendar as sacred — which is exactly what the IR calendar is for.",
        ],
        sources: [
          { label: "SEC — How to Read a 10-K/10-Q", url: "https://www.sec.gov/oiea/investor-alerts-and-bulletins/how-read-10-k10-q" },
          { label: "SEC — Form 10-K", url: "https://www.sec.gov/files/form10-k.pdf" },
        ],
      },
      {
        id: "insider-forms",
        title: "Forms 3, 4 and 5: insider transaction reporting",
        summary: "Officers, directors, and big holders must report their trades — and those filings are a powerful signal to the market.",
        body: [
          "Section 16 of the Exchange Act requires a company's officers, directors, and beneficial owners of more than 10% of a class of equity to report their holdings and transactions. Form 3 is the initial statement of holdings (filed when someone becomes an insider). Form 4 reports changes — most purchases and sales — and is due within two business days of the transaction. Form 5 is an annual catch-all for anything not previously reported.",
          "For investors, Form 4s are among the most-watched signals in the market. An open-market purchase by a CEO ('Code P' on the form) is widely read as a vote of confidence — they're putting their own money in. A cluster of sales can read the other way, though sales are often pre-planned and less meaningful. The transaction codes matter: P (purchase) and S (sale) on the open market carry the most signal; A (grant/award) and other codes less so.",
          "From the company side, two things. First, your insiders' two-business-day deadline is tight — a missed Form 4 is an embarrassing, public compliance lapse. Second, insider buying is legitimately good news you're allowed to amplify (it's already public on EDGAR) — and one of the most persuasive things a small company can surface to investors.",
        ],
        sources: [
          { label: "SEC — Forms 3, 4, 5", url: "https://www.sec.gov/about/forms/form4.pdf" },
          { label: "SEC — Insider transactions and Section 16", url: "https://www.sec.gov/divisions/corpfin/forms/securities.htm" },
        ],
      },
    ],
  },
  {
    key: "ir",
    title: "Running Investor Relations",
    blurb: "Building a program, surviving earnings, and keeping your story in front of the right people.",
    articles: [
      {
        id: "ir-program",
        title: "What an investor relations program actually does",
        summary: "Five jobs: get news out, stay visible, answer shareholders, target investors, and prove it's working.",
        body: [
          "Investor relations is often misunderstood as 'putting out press releases.' A real IR program does five distinct jobs. One: disclose news quickly and clearly, so the market hears your story from you, not from rumor. Two: maintain visibility between announcements — a company that goes silent for months effectively disappears from investors' radar. Three: engage shareholders and correct misinformation, within the disclosure rules. Four: target the right investors — for a small company, that means finding the institutions that already hold your peers. Five: measure and report results, so your board can see the program is working.",
          "For micro-cap and small-cap companies, the brutal economics are that a traditional IR agency charges $5,000–$15,000 a month to do this with people. That's out of reach for many companies that need it most — which is precisely the gap that drives a silent ticker into a death spiral: no visibility, no volume, no liquidity, worse terms on every raise.",
          "The modern alternative is to systematize the five jobs: automate the news-to-post pipeline, keep a steady compliant cadence, route shareholder questions through an approval gate, mine 13F filings for investor targets, and track a single visibility metric over time. That's the entire thesis behind PubcoZone — IR's five jobs at software speed and price, with you approving everything.",
        ],
        sources: [
          { label: "NIRI — What is Investor Relations (definition)", url: "https://www.niri.org/about-niri" },
          { label: "SEC — Investor.gov education", url: "https://www.investor.gov/" },
        ],
      },
      {
        id: "earnings-playbook",
        title: "The earnings playbook: surviving your most important week",
        summary: "Earnings is the highest-stakes, most-scrutinized moment of your quarter. Here's how to run it.",
        body: [
          "Earnings is a sequence, not an event. It starts before the release with the quiet period (covered separately), runs through the 8-K filing of results under Item 2.02, the press release, and — for many companies — a conference call, and ends with the post-call follow-through that most small companies neglect.",
          "The release itself: lead with the numbers investors care about most (revenue, margins, cash, guidance if you give it), be consistent quarter to quarter so trends are legible, and never bury bad news — the market punishes the appearance of hiding more than the news itself. Pair the GAAP results with any non-GAAP measures clearly reconciled, as the SEC requires.",
          "The call: prepared remarks should tell the story behind the numbers, and you should prepare for the hard questions in advance. A good practice is to predict the tough questions by looking at what your peers got asked and what retail investors are already debating, and to have measured, factual answers ready. The post-call package — a summary thread, the key numbers, the transcript — is where small companies leave engagement on the table.",
          "Above all, earnings is a Reg FD minefield: everything you say on the call is public, but anything you say afterward to one analyst is not. Keep post-call conversations to what's already been disclosed.",
        ],
        checklist: [
          "File results on an 8-K (Item 2.02) and issue the release",
          "Reconcile any non-GAAP numbers as required",
          "Prepare remarks + a tough-question Q&A doc in advance",
          "Ship the post-call package: thread, highlights, transcript",
          "Keep all post-call talk to already-disclosed information",
        ],
        sources: [
          { label: "SEC — Non-GAAP financial measures C&DIs", url: "https://www.sec.gov/rules-regulations/staff-guidance/compliance-disclosure-interpretations/non-gaap-financial-measures" },
          { label: "SEC — Form 8-K Item 2.02 (results)", url: "https://www.sec.gov/about/forms/form8-k.pdf" },
        ],
      },
      {
        id: "quiet-period",
        title: "The quiet period: when to keep your mouth shut",
        summary: "Around earnings and offerings, what you say is restricted. Get the timing wrong and you create real risk.",
        body: [
          "There are really two kinds of 'quiet period,' and conflating them causes trouble. The first is the earnings blackout — a best-practice window, typically the couple of weeks before you report through the release, during which companies limit communication to avoid selective disclosure or the appearance of guiding ahead of results. There's no single statute defining its length; it's a discipline, and most companies publish their policy.",
          "The second is the offering-related quiet period, which is rule-driven and stricter. When you're in registration for a securities offering, the securities laws limit what you can say so that the market isn't conditioned by promotional communications outside the prospectus. This is a genuine legal restriction, and the penalties for 'gun-jumping' are real — coordinate every communication with counsel during a deal.",
          "The practical defense is automation: know your earnings and offering dates in advance, and lock down publishing during the windows so nothing goes out by accident. PubcoZone's quiet mode does exactly this, and the IR calendar schedules the earnings blackout automatically when you enter your earnings date.",
        ],
        sources: [
          { label: "SEC — Securities Offering Reform (communications rules)", url: "https://www.sec.gov/rules/final/33-8591.pdf" },
          { label: "SEC — Investor Bulletin: IPOs and quiet periods", url: "https://www.investor.gov/" },
        ],
      },
    ],
  },
  {
    key: "defense",
    title: "Defense & Crisis",
    blurb: "Short attacks, misinformation, halts, and the moments when your reputation is under fire.",
    articles: [
      {
        id: "short-attacks",
        title: "Responding to a short attack or misinformation",
        summary: "When someone's talking your stock down, silence usually loses. But how you respond determines whether you win.",
        body: [
          "Short sellers and anonymous critics are part of public markets, and not all of them are wrong — a well-researched short thesis can be a legitimate contribution to price discovery. The problem for small companies is asymmetry: the critic is often anonymous and unaccountable, can say things fast, and faces no consequence for being wrong, while the company is constrained by disclosure rules and frequently chooses silence. Silence cedes the narrative.",
          "The disciplined response is factual, not emotional. Don't attack the critic's motives; correct the record with specifics tied to your filings. If a post claims you're insolvent, the answer is the cash figure from your last 10-Q with the citation — calm, sourced, and verifiable. This both reassures real investors and makes baseless claims look baseless by contrast.",
          "Three guardrails. First, everything you say is still public disclosure — you can't selectively reassure favored holders. Second, don't over-promise or predict price; respond to the factual claim, nothing more. Third, keep a record. If a campaign crosses into market manipulation (coordinated false statements to move the price), that record is what regulators and your counsel will need.",
          "The structural fix is to never be caught flat-footed: monitor for negative narratives, have a fact-based response drafted and ready for approval, and respond within minutes rather than days. That early-warning-plus-ready-response loop is what turns a short attack from a rout into a non-event.",
        ],
        checklist: [
          "Monitor message boards, social, and news for emerging negative narratives",
          "Respond with facts tied to filings — never attack the critic personally",
          "Keep every response within already-public disclosure",
          "Document coordinated false campaigns for counsel and regulators",
        ],
        sources: [
          { label: "SEC — Investor Alert: social media and investment fraud", url: "https://www.investor.gov/introduction-investing/general-resources/news-alerts/alerts-bulletins" },
          { label: "SEC — Market manipulation overview", url: "https://www.sec.gov/about/divisions-offices/division-enforcement" },
        ],
      },
      {
        id: "trade-halts",
        title: "Trade halts and the information vacuum",
        summary: "When trading is halted, rumor fills the silence. A prompt, factual statement is the standard playbook.",
        body: [
          "An exchange can halt trading in your stock for several reasons: a pending news announcement (a 'news-pending' halt), an order imbalance, a volatility trigger, or a regulatory concern. The most common for a company actively communicating is the news-pending halt — the exchange pauses trading so the market can absorb material news you're about to release.",
          "The danger of any halt is the information vacuum it creates. Investors see trading stop and, absent facts, fill the silence with speculation — often negative. The standard playbook is a prompt, factual statement: acknowledge the halt, state what you can about the reason within disclosure rules, and commit to an update. What you must not do is go dark.",
          "If the halt is regulatory or tied to a deficiency, the stakes are higher and counsel must lead. But the communication principle holds: a vacuum is your enemy, and a calm, sourced statement is your defense.",
        ],
        sources: [
          { label: "Nasdaq — Trading halts and codes", url: "https://www.nasdaqtrader.com/Trader.aspx?id=TradeHalts" },
          { label: "SEC — Trading halts and suspensions", url: "https://www.sec.gov/answers/tradinghalt.htm" },
        ],
      },
    ],
  },
  {
    key: "capital",
    title: "Capital & Shareholders",
    blurb: "Raising money, managing dilution, reading your investor base, and the annual meeting.",
    articles: [
      {
        id: "raising-capital",
        title: "How small companies raise money: shelf, ATM, PIPE",
        summary: "The three workhorses of small-cap financing — and why visibility and liquidity change your terms.",
        body: [
          "Most small public companies raise capital through one of three structures. A shelf registration (Form S-3, for eligible companies) lets you register a pool of securities up front and sell them over time as needed — flexible, but requires you to be current on filings and meet eligibility tests. An at-the-market (ATM) program sells shares gradually into the open market through a broker at prevailing prices — efficient and low-impact when there's enough volume to absorb it. A PIPE (private investment in public equity) sells a block of stock or convertibles to one or more investors, often at a discount, in a negotiated deal.",
          "The common thread, and the reason IR matters to your balance sheet: the terms you get depend heavily on your liquidity and visibility. An ATM only works if there's trading volume to sell into. A PIPE prices better when investors know your story and there's a real market in your stock. A company doing a financing that prices even a few percent better because there's genuine volume and a real shareholder following saves meaningful dilution. This is the concrete link between 'soft' IR and the hard cost of capital.",
          "Every financing is also a disclosure event — unregistered sales hit an 8-K (Item 3.02), and registered offerings bring the offering quiet period. Coordinate the communications plan with the deal from day one.",
        ],
        sources: [
          { label: "SEC — Form S-3 and shelf registration", url: "https://www.sec.gov/files/forms-3.pdf" },
          { label: "SEC — Private placements (Reg D)", url: "https://www.sec.gov/education/smallbusiness/exemptofferings/rule506b" },
        ],
      },
      {
        id: "reading-13f",
        title: "Reading 13F filings to find your investors",
        summary: "Every big fund discloses its holdings quarterly. That public data is a map to the investors who should own you.",
        body: [
          "Institutional investment managers with over $100 million in qualifying assets must file a Form 13F every quarter, disclosing their equity holdings. This is one of the most useful free datasets in the market: it tells you, with a delay, exactly which funds hold which stocks.",
          "For a small company, the targeting move is straightforward. Find the funds that already hold your peers — companies in your sector and size — but don't yet hold you. Those funds have demonstrated appetite for exactly your kind of stock; they're the warmest possible targets for investor outreach. You can see their position sizes and when they entered, which tells you how to approach them.",
          "Two caveats. 13F data is delayed (filed 45 days after quarter-end) and only covers long equity positions above the threshold, so it's a map, not a real-time feed. And the outreach itself must be done by the company — handing a fund your public materials and asking for a meeting is fine; what you can't do is have a paid promoter solicit investors on a contingent basis. PubcoZone's fund finder builds the target list and drafts the intro; your team sends it.",
        ],
        sources: [
          { label: "SEC — Form 13F (institutional holdings)", url: "https://www.sec.gov/divisions/investment/13ffaq.htm" },
          { label: "SEC — EDGAR full-text search (find 13F filers)", url: "https://efts.sec.gov/LATEST/search-index?q=" },
        ],
      },
    ],
  },
  {
    key: "listing",
    title: "Going & Staying Public",
    blurb: "Listing standards, what changes when you're public, and keeping your listing in good standing.",
    articles: [
      {
        id: "listing-standards",
        title: "Listing standards: staying in good standing",
        summary: "Exchanges have minimum requirements — price, market value, shareholders. Fall below and a clock starts.",
        body: [
          "Every exchange sets continued-listing standards a company must meet to stay listed. Nasdaq, for example, has minimums for bid price (the well-known $1.00 minimum), market value of listed/publicly-held shares, shareholders' equity or market value, and the number of public shareholders and market makers — with different thresholds across its Capital Market, Global Market, and Global Select tiers. NYSE and NYSE American have their own analogous standards. The TSX Venture Exchange in Canada runs a tiered system with its own continued-listing requirements.",
          "Fall below a standard and you typically receive a deficiency notice and a cure period — for the $1.00 bid-price rule, generally 180 days, sometimes extendable, often cured via a reverse stock split as a last resort. Miss the cure and you face delisting, which is severe: liquidity collapses, many institutions can't hold the stock, and raising capital becomes far harder.",
          "The connection to IR is direct. Many continued-listing problems — a sagging price, thin shareholder base, low market value — are downstream of invisibility. A company nobody is paying attention to drifts toward the thresholds. Sustained, compliant visibility is, among other things, a listing-defense strategy.",
        ],
        sources: [
          { label: "Nasdaq — Continued listing requirements", url: "https://listingcenter.nasdaq.com/rulebook/nasdaq/rules" },
          { label: "NYSE — Listed company manual", url: "https://nyseguide.srorules.com/listed-company-manual" },
          { label: "TSX Venture — Corporate Finance Manual", url: "https://www.tsx.com/listings/tsx-and-tsxv-issuer-resources/tsx-venture-exchange-issuer-resources" },
        ],
      },
      {
        id: "going-public-basics",
        title: "What changes the day you go public",
        summary: "Public company life means continuous disclosure, new liabilities, and a market watching every move.",
        body: [
          "Whether you went public via IPO, a reverse takeover (RTO), or a direct listing, the day you're public your obligations change permanently. You enter the continuous-disclosure regime: periodic reports (10-K, 10-Q), current reports (8-K), proxy statements for shareholder votes, and Section 16 filings by your insiders. Your financial statements must be audited by a PCAOB-registered firm. Your communications become subject to Reg FD and the anti-fraud and anti-touting rules.",
          "New liabilities attach. Statements you make publicly can give rise to securities-law liability if they're materially false or misleading. Officers must certify the accuracy of filings. Insider-trading rules constrain when your people can buy and sell. And the market now prices your every disclosure in real time.",
          "The cultural shift is the hardest part for many newly public teams: you can no longer communicate casually about the business. Every material statement is a disclosure event. The companies that thrive build the discipline early — a clear disclosure policy, a designated approver, a real IR calendar, and a system that makes the compliant path the easy one.",
        ],
        sources: [
          { label: "SEC — Going public and reporting obligations", url: "https://www.sec.gov/education/smallbusiness/goingpublic" },
          { label: "SEC — Exchange Act reporting requirements", url: "https://www.sec.gov/divisions/corpfin/cffaq.htm" },
        ],
      },
    ],
  },
];

export const GLOSSARY: { term: string; def: string }[] = [
  { term: "8-K", def: "A 'current report' filed to announce a material event between quarterly reports, generally within four business days." },
  { term: "10-K / 10-Q", def: "Annual (audited) and quarterly (unaudited) periodic reports to the SEC — the backbone of your public record." },
  { term: "Reg FD", def: "Regulation Fair Disclosure: bars selectively sharing material non-public information; you must disclose to everyone at once." },
  { term: "Material non-public information", def: "Information a reasonable investor would consider important to a trading decision that hasn't been publicly disclosed." },
  { term: "Form 4", def: "An insider's report of a change in holdings (most buys/sells), due within two business days of the transaction." },
  { term: "13F", def: "Quarterly disclosure by large institutional managers (>$100M) of their equity holdings — a map of who owns what." },
  { term: "13D / 13G", def: "Beneficial-ownership reports filed when an investor crosses 5% of a company's shares (13D for active, 13G for passive)." },
  { term: "Shelf registration (S-3)", def: "Registering a pool of securities up front to sell over time, for eligible current filers." },
  { term: "ATM offering", def: "An 'at-the-market' program selling shares gradually into the open market at prevailing prices through a broker." },
  { term: "PIPE", def: "Private investment in public equity — a negotiated sale of stock or convertibles to investors, often at a discount." },
  { term: "Quiet period", def: "A window (around earnings or an offering) when company communications are restricted to avoid selective or premature disclosure." },
  { term: "Short interest", def: "Shares sold short; 'days to cover' is short interest divided by average daily volume. Daily short volume includes market-making and runs higher." },
  { term: "Continued-listing standards", def: "The minimum price, market value, and shareholder requirements an exchange demands to keep you listed." },
  { term: "Section 17(b)", def: "The anti-touting rule: anyone paid to promote a security must clearly disclose the compensation." },
  { term: "MD&A", def: "Management's Discussion and Analysis — the narrative section of your filings where you explain the numbers in your own words." },
];
