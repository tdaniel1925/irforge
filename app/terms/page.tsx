import Link from "next/link";

export const metadata = { title: "Terms & Conditions — PubcoZone" };

export default function Terms() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/" className="text-sm text-emerald-600 hover:underline dark:text-emerald-400">← Back to PubcoZone</Link>
      <h1 className="mt-6 text-3xl font-bold text-app">Terms &amp; Conditions</h1>
      <p className="mt-2 text-sm text-faint">Last updated: June 26, 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted">
        <Section title="1. Agreement to Terms">
          <p>These Terms &amp; Conditions (&ldquo;Terms&rdquo;) govern your access to and use of the PubcoZone website, applications, and services (collectively, the &ldquo;Service&rdquo;). PubcoZone is a product operated by <strong>Docs2Video, LLC</strong> (&ldquo;Docs2Video,&rdquo; &ldquo;PubcoZone,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), the company that owns and operates the Service. References to &ldquo;PubcoZone&rdquo; mean the Service; references to &ldquo;we,&rdquo; &ldquo;us,&rdquo; and &ldquo;our&rdquo; mean Docs2Video, LLC as the operating company and your contracting party. By creating an account or using the Service, you agree to these Terms. If you are using the Service on behalf of a company, you represent that you are authorized to bind that company, and &ldquo;you&rdquo; refers to that company.</p>
        </Section>

        <Section title="2. Description of Service; Not Professional Advice">
          <p>PubcoZone provides software tools for investor relations, communications, document organization, and related functions for public companies, including AI-assisted drafting and analysis. <strong>The Service does not provide legal, accounting, tax, securities, or investment advice, and is not a law firm, broker-dealer, investment adviser, or transfer agent.</strong> AI-generated content, disclosure assessments, compliance checks, dilution calculations, and educational materials are informational aids only. You are solely responsible for your disclosures and communications and should confirm all material decisions with qualified legal and financial counsel.</p>
        </Section>

        <Section title="3. Your Responsibilities &amp; Compliance">
          <p>You are responsible for compliance with all applicable laws and exchange rules, including the U.S. federal securities laws, Regulation FD, anti-fraud and anti-touting rules (including Section 17(b) of the Securities Act), and the rules of any exchange on which your securities are listed. You agree:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>that only an authorized person will approve content before it is published, and that nothing is published through the Service without that approval;</li>
            <li>not to use the Service to make false, misleading, or manipulative statements, to engage in market manipulation, or to selectively disclose material non-public information;</li>
            <li>to maintain required disclosures (including compensation disclosures) on communications;</li>
            <li>that information you provide is accurate and that you have the right to provide it.</li>
          </ul>
        </Section>

        <Section title="4. Compensated Service Provider Disclosure">
          <p>PubcoZone is a compensated service provider. Where PubcoZone operates communications on behalf of a paying company, those communications are configured to carry disclosure of that compensated relationship. You agree not to remove, disable, or circumvent required disclosures, and you acknowledge that doing so may violate law and these Terms.</p>
        </Section>

        <Section title="5. Accounts &amp; Security">
          <p>You must provide accurate registration information and keep your credentials confidential. You are responsible for all activity under your account. Notify us promptly of any unauthorized use. We may suspend or terminate accounts that violate these Terms or present security or legal risk.</p>
        </Section>

        <Section title="6. Subscriptions, Fees &amp; Payment">
          <p>Paid plans are billed in advance on a recurring basis (quarterly unless otherwise stated) through our payment processor, Stripe. A one-time setup fee may apply to new subscriptions. By subscribing, you authorize recurring charges until you cancel. Fees are non-refundable except as required by law or expressly stated. We may change pricing on renewal with notice. You are responsible for applicable taxes. We do not accept securities of any company as payment.</p>
        </Section>

        <Section title="7. Cancellation">
          <p>You may cancel at the end of your current billing period through the customer portal or by contacting us. Cancellation stops future renewals; it does not retroactively refund the current period. Upon cancellation, access to paid features ends at the close of the paid term.</p>
        </Section>

        <Section title="8. Public Content &amp; Community Conduct">
          <p>Public ticker pages, boards, and Q&amp;A are public. If you post, you grant us a license to host and display your post and you are responsible for it. We use automated moderation to label or remove content; we may remove content and restrict users for manipulation, abuse, illegal activity, or violations of these Terms. Posts from non-company users are not the views of the company unless marked as verified.</p>
        </Section>

        <Section title="9. Intellectual Property">
          <p>The Service, including its software, design, and content (excluding your content and third-party public data), is owned by PubcoZone and protected by intellectual-property laws. We grant you a limited, non-exclusive, non-transferable license to use the Service per these Terms. You retain ownership of content you submit and grant us the rights necessary to operate the Service and provide the features you use.</p>
        </Section>

        <Section title="10. Third-Party Services &amp; Data">
          <p>The Service integrates third-party services (including Stripe for payments, Supabase for database and authentication, Vercel for hosting, Anthropic and Google for AI, and Zernio for social publishing) and aggregates public data from sources such as SEC EDGAR, FINRA, and exchanges. We are not responsible for third-party services or for the accuracy, completeness, or timeliness of public data, which may be delayed or incomplete. Your use of third-party services may be subject to their terms.</p>
        </Section>

        <Section title="11. Disclaimers">
          <p>THE SERVICE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant that the Service will be uninterrupted, error-free, or that AI output or aggregated data will be accurate or complete. You assume responsibility for decisions made using the Service.</p>
        </Section>

        <Section title="12. Limitation of Liability">
          <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, PUBCOZONE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUES, DATA, OR GOODWILL, ARISING FROM OR RELATED TO THE SERVICE. OUR TOTAL LIABILITY FOR ANY CLAIM WILL NOT EXCEED THE AMOUNTS YOU PAID US FOR THE SERVICE IN THE TWELVE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM.</p>
        </Section>

        <Section title="13. Indemnification">
          <p>You agree to indemnify and hold harmless PubcoZone and its officers, employees, and agents from claims, damages, liabilities, and expenses (including reasonable legal fees) arising from your content, your use of the Service, your communications and disclosures, or your violation of these Terms or applicable law.</p>
        </Section>

        <Section title="14. Termination">
          <p>We may suspend or terminate your access for violation of these Terms, non-payment, or legal/security risk. You may stop using the Service at any time. Provisions that by their nature should survive termination (including ownership, disclaimers, limitation of liability, and indemnification) will survive.</p>
        </Section>

        <Section title="15. Governing Law &amp; Disputes">
          <p>These Terms are governed by the laws of the State of Texas, without regard to conflict-of-laws principles. The exclusive venue for disputes is the state and federal courts located in Texas, and you consent to their jurisdiction, except where applicable law provides otherwise.</p>
        </Section>

        <Section title="16. Changes to These Terms">
          <p>We may modify these Terms from time to time. Material changes will be posted here with an updated date and, where appropriate, additional notice. Continued use after changes constitutes acceptance.</p>
        </Section>

        <Section title="17. Entity &amp; Contact">
          <p>The Service is owned and operated by <strong>Docs2Video, LLC</strong>, the parent and operating company of PubcoZone. Docs2Video, LLC is also the merchant of record for subscription payments processed through Stripe; charges may appear on your statement under the Docs2Video or PubcoZone name.</p>
          <p>Questions about these Terms: <a href="mailto:legal@pubcozone.com" className="text-emerald-600 hover:underline dark:text-emerald-400">legal@pubcozone.com</a>.</p>
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
