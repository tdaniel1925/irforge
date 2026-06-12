import Link from "next/link";

export const metadata = { title: "Privacy Policy — PubcoZone" };

export default function Privacy() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">← Back to PubcoZone</Link>
      <h1 className="mt-6 text-3xl font-bold text-app">Privacy Policy</h1>
      <p className="mt-2 text-sm text-faint">Last updated: June 12, 2026</p>

      <div className="prose-pubco mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <Section title="1. Introduction">
          <p>PubcoZone (&ldquo;PubcoZone,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) provides an investor-relations and communications platform for public companies. This Privacy Policy explains what information we collect, how we use it, with whom we share it, and the choices you have. It applies to our website, applications, and services (collectively, the &ldquo;Service&rdquo;). By using the Service you agree to this Policy.</p>
        </Section>

        <Section title="2. Information We Collect">
          <p><strong>Account &amp; company information.</strong> When you register or onboard, we collect your name, email, password (stored hashed by our authentication provider), company name, ticker symbol, SEC CIK, role/title, and related business details you provide.</p>
          <p><strong>Content you create.</strong> Drafts, approvals, press releases, disclosure checks, contacts, documents, cap-table and convertible-note records, calendar entries, and other content you enter or upload to the Service.</p>
          <p><strong>Payment information.</strong> We use Stripe to process payments. We do not store full card numbers on our systems; Stripe collects and stores your payment details under its own privacy and security practices. We retain limited billing metadata (customer ID, subscription status, plan, invoice history).</p>
          <p><strong>Public market data.</strong> The Service aggregates publicly available data about companies and tickers from sources including SEC EDGAR, FINRA, StockTwits, Reddit, Yahoo Finance, GDELT, ClinicalTrials.gov, USAspending.gov, openFDA, Wikipedia/Wikidata, and exchange websites. This data is public and not personal information about you.</p>
          <p><strong>Public submissions.</strong> If you post on a public ticker board, ask a question, or submit a &ldquo;claim this page&rdquo; request, we collect the name/handle, email (where provided), and content you submit. Public board posts and questions are, by design, publicly visible.</p>
          <p><strong>Usage &amp; technical data.</strong> Log data, IP address, browser/device information, pages viewed, and approximate location, collected automatically to operate and secure the Service.</p>
        </Section>

        <Section title="3. How We Use Information">
          <ul className="list-disc space-y-1 pl-5">
            <li>To provide, operate, maintain, and improve the Service;</li>
            <li>To generate AI-assisted drafts, analyses, and summaries from your content and public data;</li>
            <li>To process subscriptions, payments, and invoices through Stripe;</li>
            <li>To communicate with you about your account, security, updates, and support;</li>
            <li>To maintain an audit log of actions taken in the Service for compliance and security;</li>
            <li>To detect, prevent, and respond to fraud, abuse, and security incidents;</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </Section>

        <Section title="4. AI Processing">
          <p>The Service uses third-party AI providers (including Anthropic and Google) to generate drafts, analyses, moderation labels, and summaries. Content you submit for these features (for example, a document you ask us to analyze, or a filing we draft a post from) is transmitted to these providers to produce the output. We instruct our AI features to operate only on information you provide or that is already public, and we do not use your confidential content to train third-party foundation models beyond what is necessary to return your result. AI output is provided for your review and is not legal, financial, or investment advice.</p>
        </Section>

        <Section title="5. How We Share Information">
          <p>We do not sell your personal information. We share information only as follows:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>Service providers</strong> who process data on our behalf under contract — including hosting (Vercel), database and authentication (Supabase), payments (Stripe), AI (Anthropic, Google), email, and social-posting (Ayrshare). They may access data only to perform services for us.</li>
            <li><strong>Public disclosure features.</strong> When you approve a post, answer, or release, it is published to the channels you direct (such as X and your public page) and becomes public. This is an intended feature of the Service.</li>
            <li><strong>Legal &amp; safety.</strong> When required by law, legal process, or to protect rights, safety, and the integrity of the Service.</li>
            <li><strong>Business transfers.</strong> In connection with a merger, acquisition, or sale of assets, subject to this Policy.</li>
          </ul>
        </Section>

        <Section title="6. Data Isolation &amp; Security">
          <p>Each customer&apos;s private data is isolated at the database level using row-level security, so one customer cannot access another customer&apos;s data. We use encryption in transit, access controls, and audit logging. No method of transmission or storage is perfectly secure, and we cannot guarantee absolute security.</p>
        </Section>

        <Section title="7. Data Retention">
          <p>We retain your information for as long as your account is active and as needed to provide the Service, comply with our legal obligations (including records that support required securities-law disclosures), resolve disputes, and enforce our agreements. You may request deletion of your account; certain records (such as audit logs and billing records) may be retained where required.</p>
        </Section>

        <Section title="8. Your Rights &amp; Choices">
          <p>Depending on your jurisdiction, you may have rights to access, correct, delete, or port your personal information, and to object to or restrict certain processing. To exercise these rights, contact us at the address below. You can update most account information directly in the Service and manage your subscription through the Stripe customer portal.</p>
        </Section>

        <Section title="9. International Users">
          <p>The Service is operated from the United States. If you access it from elsewhere, you consent to the transfer and processing of your information in the United States and other countries where our providers operate.</p>
        </Section>

        <Section title="10. Children">
          <p>The Service is for businesses and is not directed to individuals under 18. We do not knowingly collect personal information from children.</p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>We may update this Policy from time to time. Material changes will be posted here with an updated date and, where appropriate, additional notice.</p>
        </Section>

        <Section title="12. Contact">
          <p>Questions about this Policy or your data: privacy@pubcozone.com.</p>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold text-app">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
