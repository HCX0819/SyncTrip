import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — SyncTrip",
  description: "The terms that apply when you use SyncTrip.",
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

export default function TermsPage() {
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
          Terms of Service
        </h1>
        <p style={{ ...p, fontSize: "13px" }}>Effective date: [effective date]</p>

        <p style={p}>
          These terms are an agreement between you and [Company / operator name] (&ldquo;we&rdquo;,
          &ldquo;us&rdquo;) for your use of SyncTrip, a group trip-planning app. By creating an account or using
          SyncTrip you agree to these terms and to our{" "}
          <Link href="/privacy" style={{ color: "var(--accent)" }}>Privacy Policy</Link>. If you don&apos;t agree,
          please don&apos;t use the app.
        </p>

        <h2 style={h2}>1. Your account</h2>
        <ul style={ul}>
          <li style={li}>You must be at least [minimum age, e.g. 13 / 16] years old to use SyncTrip.</li>
          <li style={li}>You sign in with an email magic link or Google. Keep access to your email and Google account secure — anyone who controls them can sign in as you.</li>
          <li style={li}>You are responsible for activity on your account.</li>
          <li style={li}>You can delete your account at any time from Profile → Delete account.</li>
        </ul>

        <h2 style={h2}>2. Trips and sharing</h2>
        <p style={p}>
          Anyone who has a trip&apos;s invite link can join that trip and see its content. Only share invite links
          with people you trust. Trip owners can manage their trips; members can add places, vote and edit the
          itinerary.
        </p>

        <h2 style={h2}>3. Your content</h2>
        <p style={p}>
          You keep ownership of the content you add (notes, links, photos and so on). You give us a limited,
          worldwide, royalty-free licence to store, display and process that content only as needed to run
          SyncTrip and show it to the members of your trips. This licence ends when the content is deleted, except
          for backup copies that expire on their normal schedule.
        </p>
        <p style={p}>
          You confirm you have the right to upload the content you add, including photos, and that it does not
          infringe anyone else&apos;s rights.
        </p>

        <h2 style={h2}>4. Acceptable use</h2>
        <p style={p}>You agree not to:</p>
        <ul style={ul}>
          <li style={li}>upload illegal, harassing, hateful, sexually explicit or infringing content;</li>
          <li style={li}>upload malware, or try to break, overload, probe or bypass the security of the service;</li>
          <li style={li}>access trips or data you weren&apos;t invited to, or scrape the service;</li>
          <li style={li}>use SyncTrip to send spam or for any unlawful purpose.</li>
        </ul>
        <p style={p}>
          We may remove content or suspend accounts that break these terms.
        </p>

        <h2 style={h2}>5. Third-party services</h2>
        <p style={p}>
          SyncTrip uses third-party services such as map and place-search providers (Mapbox, OpenStreetMap) and
          links to external websites. Place information, addresses and map data come from those sources and may be
          incomplete or out of date — always check opening hours, prices, bookings and travel requirements
          yourself. We are not responsible for third-party websites or services.
        </p>

        <h2 style={h2}>6. The service</h2>
        <p style={p}>
          SyncTrip is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. We work to keep it running and
          your data safe, but we don&apos;t guarantee it will be uninterrupted or error-free, and we may change,
          suspend or discontinue features. If we shut SyncTrip down, we will give reasonable notice where
          possible. Keep your own copy of anything important.
        </p>

        <h2 style={h2}>7. Liability</h2>
        <p style={p}>
          To the extent permitted by law, we are not liable for indirect or consequential losses, or for losses
          arising from travel decisions, bookings or third-party information. Our total liability to you for any
          claim relating to SyncTrip is limited to [liability cap, e.g. the amount you paid us in the past 12
          months, or a fixed amount]. Nothing in these terms limits rights you have under consumer law that cannot
          be excluded.
        </p>

        <h2 style={h2}>8. Ending these terms</h2>
        <p style={p}>
          You can stop using SyncTrip and delete your account at any time. We may suspend or end your access if you
          seriously or repeatedly break these terms.
        </p>

        <h2 style={h2}>9. Changes</h2>
        <p style={p}>
          We may update these terms. If changes are material, we will tell you in the app or by email before they
          take effect. Continuing to use SyncTrip after that means you accept the updated terms.
        </p>

        <h2 style={h2}>10. Governing law</h2>
        <p style={p}>
          These terms are governed by the laws of [governing law / jurisdiction], and disputes will be handled by
          the courts of [venue], subject to any mandatory consumer-protection rights in your country.
        </p>

        <h2 style={h2}>11. Contact</h2>
        <p style={p}>
          [Company / operator name]
          <br />
          [registered address]
          <br />
          Email: [contact email]
        </p>
      </article>
    </main>
  );
}
