import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — SyncTrip",
  description: "How SyncTrip collects, uses, stores and deletes your data.",
};

// NOTE: Bracketed placeholders like [Company / operator name] must be filled
// in before launch. This draft is not legal advice — have it reviewed.

const h2: React.CSSProperties = {
  fontFamily: "var(--font-serif)",
  fontSize: "20px",
  fontWeight: 500,
  margin: "36px 0 12px",
  color: "var(--text)",
};
const p: React.CSSProperties = { margin: "0 0 12px" };
const ul: React.CSSProperties = { margin: "0 0 12px", paddingLeft: "20px", listStyle: "disc" };
const li: React.CSSProperties = { marginBottom: "6px" };

export default function PrivacyPage() {
  return (
    <main style={{ minHeight: "100dvh", background: "var(--bg)", padding: "48px 20px 64px" }}>
      <article
        style={{
          maxWidth: 680,
          margin: "0 auto",
          color: "var(--text-muted)",
          fontSize: "15px",
          lineHeight: 1.7,
        }}
      >
        <Link href="/" style={{ color: "var(--accent)", fontSize: "13px", textDecoration: "none" }}>
          ← SyncTrip
        </Link>
        <h1
          style={{
            fontFamily: "var(--font-serif)",
            fontSize: "32px",
            fontWeight: 500,
            color: "var(--text)",
            margin: "16px 0 6px",
          }}
        >
          Privacy Policy
        </h1>
        <p style={{ ...p, fontSize: "13px" }}>Effective date: [effective date]</p>

        <p style={p}>
          SyncTrip (&ldquo;SyncTrip&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a group trip-planning app
          operated by [Company / operator name] ([registered address]). This policy explains what personal data
          we collect when you use SyncTrip, why, who we share it with, how long we keep it, and the choices you
          have.
        </p>

        <h2 style={h2}>1. Data we collect</h2>
        <ul style={ul}>
          <li style={li}>
            <strong>Account data</strong> — your email address, used to sign you in with a magic link. If you
            sign in with Google, we receive your name, email address and profile picture from Google.
          </li>
          <li style={li}>
            <strong>Profile data</strong> — the display name and avatar you choose. These are visible to the
            other members of trips you belong to.
          </li>
          <li style={li}>
            <strong>Trip content</strong> — trips you create or join (name, destination, dates, cover image),
            saved places (titles, notes, links, addresses, map coordinates and photos you upload), votes and
            itinerary plans. Trip content is visible to every member of that trip.
          </li>
          <li style={li}>
            <strong>Place search queries</strong> — text you type into place search is sent to our geocoding
            provider to find matching places.
          </li>
          <li style={li}>
            <strong>Technical data</strong> — authentication cookies needed to keep you signed in, and
            standard server logs (such as IP address, browser type and timestamps) kept by our hosting
            providers. If the app crashes, an error report (stack trace, browser and device type, the page you
            were on) may be sent to our error-monitoring provider. We configure it not to collect personal
            data such as IP addresses or cookies by default.
          </li>
        </ul>
        <p style={p}>
          We do not sell your personal data, show ads, or use third-party advertising trackers.
        </p>

        <h2 style={h2}>2. How we use it</h2>
        <ul style={ul}>
          <li style={li}>To create and secure your account and sign you in.</li>
          <li style={li}>To provide the app&apos;s features: sharing trips, places, votes and itineraries with the members you invite.</li>
          <li style={li}>To find places and show them on a map.</li>
          <li style={li}>To diagnose bugs, prevent abuse and keep the service running.</li>
          <li style={li}>To send service emails you request, such as sign-in links. We do not send marketing email.</li>
        </ul>
        <p style={p}>
          Where data-protection law requires a legal basis, we rely on performing our contract with you
          (providing the service you signed up for) and our legitimate interest in keeping the service secure
          and working.
        </p>

        <h2 style={h2}>3. Who we share it with</h2>
        <p style={p}>
          Other members of a trip can see the content of that trip and your display name and avatar. Apart from
          that, we share data only with service providers (processors) that run SyncTrip on our behalf:
        </p>
        <ul style={ul}>
          <li style={li}><strong>Supabase</strong> — database, authentication and file storage (account data, trip content, uploaded photos).</li>
          <li style={li}><strong>Vercel</strong> — application hosting and delivery (request logs).</li>
          <li style={li}><strong>Mapbox</strong> and/or <strong>OpenStreetMap Nominatim</strong> — place search and geocoding (your search queries).</li>
          <li style={li}><strong>Google</strong> — optional &ldquo;Continue with Google&rdquo; sign-in.</li>
          <li style={li}><strong>Sentry</strong> — error monitoring (crash reports).</li>
          <li style={li}>[Email delivery provider, if a custom SMTP service is used for sign-in emails]</li>
        </ul>
        <p style={p}>
          These providers may process data outside your country, including in the United States. Where
          required, transfers are covered by the providers&apos; standard contractual clauses or equivalent
          safeguards. We may also disclose data if required by law.
        </p>
        <p style={p}>
          <strong>Photos:</strong> uploaded place photos are stored in a storage bucket that serves files by
          unguessable URL. Anyone who has a photo&apos;s direct link can view it, so avoid uploading sensitive
          images.
        </p>

        <h2 style={h2}>4. Retention and deletion</h2>
        <ul style={ul}>
          <li style={li}>
            We keep your account and content for as long as your account exists.
          </li>
          <li style={li}>
            You can delete your account at any time from <strong>Profile → Delete account</strong>. This
            permanently removes your sign-in account, profile, trip memberships and votes. Trips and places you
            added to shared trips stay available to the other members so their plans aren&apos;t lost, but are
            no longer linked to you. If you want that content removed too, delete it before deleting your
            account or contact us.
          </li>
          <li style={li}>
            Residual copies may remain in our providers&apos; backups for up to [backup retention period, e.g.
            30 days] before being overwritten. Server and error logs are kept for up to [log retention period].
          </li>
        </ul>

        <h2 style={h2}>5. Your rights</h2>
        <p style={p}>
          Depending on where you live (for example under the EU/UK GDPR or Singapore/Malaysia PDPA), you may have
          the right to:
        </p>
        <ul style={ul}>
          <li style={li}>access the personal data we hold about you and get a copy of it;</li>
          <li style={li}>correct inaccurate data (most of it you can edit directly in the app);</li>
          <li style={li}>delete your data (see above);</li>
          <li style={li}>object to or restrict certain processing, and withdraw consent where we rely on it;</li>
          <li style={li}>receive your data in a portable format;</li>
          <li style={li}>complain to your local data-protection authority.</li>
        </ul>
        <p style={p}>
          To exercise any of these rights, contact us at [contact email]. We will respond within the time
          required by applicable law.
        </p>

        <h2 style={h2}>6. Security</h2>
        <p style={p}>
          Data is encrypted in transit (HTTPS). Access to trip data is restricted to trip members by database
          access rules. No system is perfectly secure, but we work to protect your data and will notify you and
          the relevant authorities of a breach where the law requires.
        </p>

        <h2 style={h2}>7. Children</h2>
        <p style={p}>
          SyncTrip is not directed at children under [minimum age, e.g. 13 / 16]. If you believe a child has given
          us personal data, contact us and we will delete it.
        </p>

        <h2 style={h2}>8. Changes</h2>
        <p style={p}>
          We may update this policy. If we make material changes we will let you know in the app or by email
          before they take effect. The effective date above shows when it was last changed.
        </p>

        <h2 style={h2}>9. Contact</h2>
        <p style={p}>
          [Company / operator name]
          <br />
          [registered address]
          <br />
          Email: [contact email]
          <br />
          [Data protection officer / EU or UK representative, if required]
        </p>

        <p style={{ ...p, marginTop: "40px", fontSize: "13px" }}>
          See also our <Link href="/terms" style={{ color: "var(--accent)" }}>Terms of Service</Link>.
        </p>
      </article>
    </main>
  );
}
