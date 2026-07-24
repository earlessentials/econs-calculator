import type { Metadata } from "next";
import LegalShell from "../legal-shell";

export const metadata: Metadata = {
  title: "Educational Disclaimer — Econome by Pearling",
  description:
    "Important limits and no-reliance information for Econome calculator results.",
};

export default function DisclaimerPage() {
  return (
    <LegalShell
      eyebrow="Use with judgment"
      title="Educational Disclaimer"
      intro="Econome helps translate standard formulas into numbers. It does not decide whether a formula, assumption, or result is right for your situation."
    >
      <section>
        <h2>Not professional advice</h2>
        <p>
          Nothing on Econome is financial, investment, legal, tax, accounting,
          medical, statistical, academic, or other professional advice. The site
          does not create a professional, fiduciary, advisory, or client
          relationship.
        </p>
      </section>

      <section>
        <h2>Models are simplified</h2>
        <p>
          Economic and neuroeconomic formulas depend on definitions, units,
          parameter choices, model assumptions, timing, data quality, and
          context. A mathematically calculated result can still be unsuitable,
          incomplete, misleading, or wrong for a particular real-world use.
        </p>
      </section>

      <section>
        <h2>No prediction or guarantee</h2>
        <p>
          Outputs are estimates produced from the values you enter. They do not
          predict markets, behavior, policy effects, health outcomes, academic
          performance, or future events. No result, interpretation, formula, or
          availability is guaranteed to be accurate, complete, current, or
          error-free.
        </p>
      </section>

      <section>
        <h2>Independent verification required</h2>
        <p>
          Check calculations against authoritative sources, course materials,
          original research, appropriate software, and qualified professionals
          before acting. Do not use Econome as the sole basis for a financial,
          legal, health, policy, employment, academic, research, or business
          decision.
        </p>
      </section>

      <section>
        <h2>Use at your own risk</h2>
        <p>
          You voluntarily assume the risks of using and relying on the site. To
          the fullest extent permitted by law, the site owner and contributors
          are not responsible for actions you take, decisions you make, or loss
          or harm arising from your inputs, interpretation, reliance, misuse, or
          inability to access the site.
        </p>
      </section>

      <section>
        <h2>Academic integrity</h2>
        <p>
          You are responsible for following the rules of your school, course,
          institution, publisher, employer, or research setting. Cite sources
          when required and do not present unchecked calculator output as
          original analysis or verified evidence.
        </p>
      </section>
    </LegalShell>
  );
}
