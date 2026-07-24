import type { Metadata } from "next";
import LegalShell from "../legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — Econome by Pearling",
  description: "How Econome handles calculator inputs and visitor privacy.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Your privacy"
      title="Privacy Policy"
      intro="Econome is designed to calculate without collecting the information you enter."
    >
      <section>
        <h2>What Econome processes</h2>
        <p>
          Calculator values, formula searches, and selected categories are
          processed in your browser so the site can display results. Econome
          does not send those values to the site owner, save them in a
          database, or use them to create a profile.
        </p>
        <p>
          If you choose “Copy result,” your browser writes that result to your
          device clipboard only after your action.
        </p>
      </section>

      <section>
        <h2>What the site does not use</h2>
        <p>
          Econome does not provide user accounts, advertising, payment
          processing, analytics trackers, marketing pixels, or an owner-operated
          cookie system. Please do not enter personal, confidential, regulated,
          or security-sensitive information into any calculator.
        </p>
      </section>

      <section>
        <h2>GitHub Pages hosting</h2>
        <p>
          Econome is hosted by GitHub Pages. GitHub states that it logs a
          visitor&apos;s IP address for security purposes when a Pages site is
          visited, whether or not the visitor is signed in. GitHub may also
          process device, request, and service-usage information under its own
          policies.
        </p>
        <p>
          Review the{" "}
          <a
            href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
            rel="noreferrer"
            target="_blank"
          >
            GitHub General Privacy Statement
          </a>{" "}
          for information about GitHub&apos;s processing, retention, security,
          and privacy-request channels.
        </p>
      </section>

      <section>
        <h2>Retention and security</h2>
        <p>
          Because the site owner does not receive or store calculator entries,
          the owner has no calculator-entry database to access, correct, export,
          or delete. Information processed independently by GitHub is controlled
          and retained by GitHub under its policies.
        </p>
        <p>
          No internet service can promise absolute security. Use the site only
          with non-sensitive inputs and keep your browser and device reasonably
          protected.
        </p>
      </section>

      <section>
        <h2>Children and changes</h2>
        <p>
          Econome is a general educational tool and does not knowingly request
          personal information from children. This policy may be updated if the
          site&apos;s features or hosting practices change. The effective date
          above identifies the current version.
        </p>
      </section>

      <section>
        <h2>Questions</h2>
        <p>
          Site-specific questions can be raised through the{" "}
          <a
            href="https://github.com/earlessentials/econs-calculator/issues"
            rel="noreferrer"
            target="_blank"
          >
            public repository issue tracker
          </a>
          . Do not post personal or confidential information in a public issue.
          Requests about data processed by GitHub should be directed to GitHub
          through the channels in its Privacy Statement.
        </p>
      </section>
    </LegalShell>
  );
}
