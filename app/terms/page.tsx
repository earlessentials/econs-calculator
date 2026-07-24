import type { Metadata } from "next";
import LegalShell from "../legal-shell";

export const metadata: Metadata = {
  title: "Terms of Use — Econome by Pearling",
  description: "Terms that apply when using the Econome calculator library.",
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Please read"
      title="Terms of Use"
      intro="By using Econome, you agree to use it as an educational reference and to remain responsible for your own decisions."
    >
      <section>
        <h2>Educational use</h2>
        <p>
          Econome provides general educational calculators and explanatory
          material. It is not a substitute for professional advice, independent
          research, source data, course instructions, or a qualified expert who
          understands your circumstances.
        </p>
      </section>

      <section>
        <h2>Your responsibility</h2>
        <p>
          You are responsible for choosing appropriate formulas, entering
          accurate and consistently scaled data, reviewing assumptions, checking
          units, and independently verifying every result before relying on it.
          You remain solely responsible for decisions, submissions,
          transactions, research, or other actions you take after using the
          site.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>
          You may use the site for lawful personal, educational, and research
          purposes. You may not interfere with the site, attempt unauthorized
          access, use it to violate another person&apos;s rights, or misrepresent
          generated results as verified professional advice.
        </p>
      </section>

      <section>
        <h2>No warranties</h2>
        <p>
          Econome is provided “as is” and “as available.” To the fullest extent
          permitted by applicable law, the site owner disclaims express and
          implied warranties, including warranties of accuracy, completeness,
          reliability, fitness for a particular purpose, availability,
          non-infringement, and error-free operation.
        </p>
      </section>

      <section>
        <h2>Limitation of liability</h2>
        <p>
          To the fullest extent permitted by applicable law, the site owner and
          contributors will not be liable for indirect, incidental, special,
          consequential, exemplary, or punitive loss, or for lost profits,
          opportunities, data, grades, research outcomes, investment outcomes,
          or business decisions arising from or related to use of—or inability
          to use—the site.
        </p>
        <p>
          Nothing in these Terms excludes or limits liability that cannot
          lawfully be excluded or limited. Your local consumer and statutory
          rights remain unaffected where they apply.
        </p>
      </section>

      <section>
        <h2>Third-party services and changes</h2>
        <p>
          The site relies on GitHub Pages for hosting and may link to external
          services. Their terms and policies apply independently. Formulas,
          features, and these Terms may be corrected or updated without prior
          notice. Continued use after an update means the revised Terms apply.
        </p>
      </section>

      <section>
        <h2>Severability</h2>
        <p>
          If a provision of these Terms is found unenforceable, it will be
          limited to the minimum extent necessary, and the remaining provisions
          will continue to apply.
        </p>
      </section>
    </LegalShell>
  );
}
