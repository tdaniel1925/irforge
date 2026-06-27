// Core domain types for PubcoZone

export type DraftStatus = "pending" | "approved" | "rejected" | "posted" | "blocked";
export type DraftKind = "filing_thread" | "cadence" | "reply" | "public_answer" | "press_release";

export interface PressRelease {
  id: string;
  headline: string;
  dateline: string; // "CITY, STATE — Date"
  body: string; // full release text
  status: DraftStatus; // reuses draft lifecycle
  complianceFlags: ComplianceFlag[];
  createdAt: string;
  decidedBy?: string;
  decidedAt?: string;
}

export interface DisclosureCheck {
  id: string;
  event: string; // what happened, in the owner's words
  likelyMaterial: boolean;
  form: string; // suggested form, e.g. "8-K Item 1.01"
  reasoning: string;
  draftLanguage: string;
  createdAt: string;
}

export interface CalendarEvent {
  id: string;
  date: string; // ISO date
  title: string;
  type: "earnings" | "filing_deadline" | "conference" | "lockup" | "quiet_start" | "quiet_end" | "holiday" | "presentation" | "follow_up_call" | "onboarding_session" | "team_meeting" | "reminder" | "custom";
  note?: string;
}

export type ContactType = "fund" | "analyst" | "broker" | "shareholder" | "media" | "advisor" | "other";
export type ContactStage = "identified" | "contacted" | "meeting" | "holder" | "passed";

export interface ContactInteraction {
  id: string;
  ts: string;
  kind: "call" | "meeting" | "email" | "note";
  summary: string;
}

export interface Contact {
  id: string;
  name: string;
  firm?: string;
  type: ContactType;
  email?: string;
  phone?: string;
  stage: ContactStage;
  peersHeld?: string[]; // tickers this contact's fund holds (13F intel)
  aum?: string;
  notes?: string;
  interactions: ContactInteraction[];
  nextFollowUp?: string; // ISO date
  createdAt: string;
}

export interface DocAnalysis {
  id: string;
  docName: string;
  summary: string;
  keyTerms: { label: string; value: string }[];
  risks: string[];
  disclosureTrigger: string; // "Likely 8-K Item X.XX" or "Probably not 8-K-triggering"
  createdAt: string;
  engine: "claude" | "template";
}

export type NoteConversionType = "fixed" | "variable";

export interface ConvertibleNote {
  id: string;
  holder: string;
  principal: number;
  issueDate: string;
  maturityDate: string;
  interestRate: number; // annual %
  conversionType: NoteConversionType;
  conversionPrice?: number; // fixed: $/share; variable: effective floor or n/a
  discountPct?: number; // variable: discount to market
  note?: string;
  status: "outstanding" | "converted" | "repaid";
}

export type HolderClass = "common" | "preferred" | "insider" | "options" | "warrants";
export type HolderIntent = "accumulating" | "holding" | "trimming" | "exiting" | "unknown";

export interface CapTableEntry {
  id: string;
  holder: string;
  class: HolderClass;
  shares: number; // or units for options/warrants
  costBasis?: number; // $/share
  strikePrice?: number; // options/warrants
  contactId?: string; // link to CRM contact
  intent?: HolderIntent;
  notes?: string;
  updatedAt: string;
}

export type DocCategory = "filing" | "governance" | "financing" | "policy" | "ir_material" | "other";

export interface CompanyDoc {
  id: string;
  name: string;
  category: DocCategory;
  url?: string; // link (e.g. EDGAR) or stored file URL
  note?: string;
  filedDate?: string; // for filings
  uploadedAt: string;
  source: "edgar" | "uploaded" | "link";
}

export interface PublicQuestion {
  id: string;
  ticker: string;
  author: string; // display name the asker provided
  question: string;
  ts: string;
  status: "open" | "answered" | "declined";
  answerDraftId?: string;
  answerText?: string;
  answeredAt?: string;
  xPostUrl?: string; // the simultaneous X disclosure post
}
export type FilingSource = "edgar" | "demo" | "company";
export type InvestorStage = "identified" | "outreach_drafted" | "contacted" | "meeting" | "holder";
export type Sentiment = "positive" | "neutral" | "negative" | "question";

export interface Company {
  name: string;
  ticker: string;
  exchange: string;
  cik: string; // SEC CIK, digits only
  sector: string;
  city?: string;
  state?: string;
  description: string;
  approverName: string;
  approverTitle: string;
  quietMode: boolean;
  disclosureText: string; // appended to every published post — never removable at publish time
  flsText: string; // forward-looking statements language
  brandColors?: string; // free-text brand color hint for AI image generation (e.g. "navy blue and red")
  peers: string[]; // peer tickers used for 13F targeting
  xHandle: string;
  onboarded: boolean;
  tier: "free" | "starter" | "growth" | "pro";
  subscription_status?: string; // none | active | trialing | past_due | canceled
  comped?: boolean; // free/promo access — no Stripe subscription; hide pricing/checkout
  onboarding_complete: boolean;
  // This company's Ayrshare user profile (their own linked socials). NOTE: this is
  // the only handle to the profile — Ayrshare's delete API needs this exact value
  // (returned just once, at create time) and the listing API only exposes refId,
  // which delete rejects. Profiles created before this field was persisted can't be
  // deleted from code; they must be removed by hand in the Ayrshare dashboard.
  ayrshareProfileKey?: string;
}

export interface Filing {
  id: string;
  form: string; // "8-K", "10-Q", ...
  title: string;
  filedAt: string; // ISO date
  url: string;
  summary: string;
  source: FilingSource;
  draftId?: string; // thread draft generated from this filing
  fullText?: string; // company-provided disclosure body, used as drafting context
}

export interface ComplianceFlag {
  rule: string;
  excerpt: string;
  severity: "block" | "warn";
}

export interface Draft {
  id: string;
  kind: DraftKind;
  filingId?: string;
  mentionId?: string;
  questionId?: string; // public_answer drafts link back to the asked question
  title: string;
  tweets: string[]; // thread body, disclosures appended at publish
  status: DraftStatus;
  complianceFlags: ComplianceFlag[];
  createdAt: string;
  decidedAt?: string;
  decidedBy?: string;
  postedAt?: string;
  postUrl?: string; // live X URL when published via Ayrshare
  aiEngine: "claude" | "template";
}

export interface AuditEvent {
  id: string;
  ts: string;
  actor: string;
  action: string;
  detail: string;
}

export interface InvestorTarget {
  id: string;
  fund: string;
  type: string; // "Hedge Fund" | "Family Office" | ...
  aum: string;
  peersHeld: string[]; // which peer tickers they hold
  positionNote: string;
  stage: InvestorStage;
  outreachDraft: string;
  // Real SEC-sourced contact research (Fund Finder). Optional so older rows still load.
  cik?: string;
  address?: string;      // real business address from SEC submissions
  phone?: string;        // real phone from SEC submissions (may be blank)
  edgarUrl?: string;     // EDGAR filer page (13F history)
  advSearchUrl?: string; // SEC IAPD/ADV search prefilled with the firm name
  lastFiling?: string;   // most recent filing date on record
  submissionCriteria?: string; // how funds like this typically want to be approached
  source?: "sec_13f" | "ai_research"; // where this target came from
}

export interface Mention {
  id: string;
  author: string;
  text: string;
  ts: string;
  sentiment: Sentiment;
  requiresNonPublicInfo: boolean;
  replyDraftId?: string;
}

export interface WeeklyMetric {
  weekStart: string; // ISO date (Monday)
  followers: number;
  impressions: number;
  engagements: number;
  mentions: number;
  sentimentScore: number; // -1..1
}

export interface ScoreSnapshot {
  ts: string;
  score: number;
  grade: string;
  pillars: { key: string; label: string; score: number | null; detail?: string }[];
}

export interface Database {
  company: Company;
  filings: Filing[];
  drafts: Draft[];
  audit: AuditEvent[];
  investors: InvestorTarget[];
  mentions: Mention[];
  metrics: WeeklyMetric[];
  scoreHistory: ScoreSnapshot[];
  publicQuestions: PublicQuestion[];
  pressReleases: PressRelease[];
  disclosureChecks: DisclosureCheck[];
  calendar: CalendarEvent[];
  contacts: Contact[];
  documents: CompanyDoc[];
  docAnalyses: DocAnalysis[];
  convertibleNotes: ConvertibleNote[];
  capTable: CapTableEntry[];
}
