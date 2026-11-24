import { useEffect } from "react";
import { Link } from "react-router-dom";
import LoginFooter from "../components/shared/LoginFooter";
import LoginHeader from "../components/shared/LoginHeader";
import { LEGAL } from "../config/legal";

const PAGES = {
  terms: {
    title: "Terms of service",
    other: { to: "/privacy", label: "Privacy policy" },
    sections: [
      ["Using Fuelo", "Placeholder text. Describe who may use the service and what they agree to."],
      ["Accounts and workspaces", "Placeholder text. Describe account ownership and member access."],
      ["Plans and billing", "Placeholder text. Describe plans, renewals, refunds and cancellation."],
      ["Limits of liability", "Placeholder text. Describe warranties and liability limits."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    other: { to: "/terms", label: "Terms of service" },
    sections: [
      ["What we collect", "Placeholder text. List the data stored, such as customer names and phone numbers."],
      ["How we use it", "Placeholder text. Describe receipts, reminders and reports."],
      ["Who we share it with", "Placeholder text. Name messaging and payment providers."],
      ["Your choices", "Placeholder text. Describe access, correction and deletion requests."],
    ],
  },
};

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export default function LegalPage({ kind }) {
  const page = PAGES[kind];
  const sections = [...page.sections, ["Contact us", null]];

  useEffect(() => {
    document.title = `${page.title} · Fuelo`;
    window.scrollTo(0, 0);
  }, [page.title]);

  return (
    <div id="top" className="flex min-h-screen flex-col bg-fuelo-surface text-white print:bg-white">
      <div className="print:hidden">
        <LoginHeader />
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:py-10">
        <div className="bg-white p-5 text-fuelo-ink sm:p-10 print:p-0">
          <p
            role="note"
            className="mb-6 rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900 print:hidden"
          >
            Placeholder, to be replaced by real legal text. Do not rely on this page.
          </p>

          <header className="border-b border-slate-200 pb-5">
            <h1 className="text-2xl font-bold sm:text-3xl">{page.title}</h1>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
              <div className="flex gap-1">
                <dt>Effective:</dt>
                <dd>{LEGAL.effectiveDate}</dd>
              </div>
              <div className="flex gap-1">
                <dt>Last updated:</dt>
                <dd>{LEGAL.lastUpdated}</dd>
              </div>
            </dl>
            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm print:hidden">
              <Link to={page.other.to} className="font-semibold text-fuelo-coral hover:underline">
                Read the {page.other.label.toLowerCase()}
              </Link>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-11 items-center font-semibold text-slate-600 hover:text-fuelo-ink"
              >
                Print or save as PDF
              </button>
            </div>
          </header>

          <div className="mt-6 grid gap-8 md:grid-cols-[220px_1fr]">
            <nav aria-label="On this page" className="print:hidden md:sticky md:top-6 md:self-start">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                On this page
              </p>
              <ol className="mt-2 space-y-1 text-sm">
                {sections.map(([heading], index) => (
                  <li key={heading}>
                    <a
                      href={`#${slug(heading)}`}
                      className="inline-flex min-h-11 items-center gap-2 text-slate-600 hover:text-fuelo-coral md:min-h-0 md:py-1"
                    >
                      <span className="w-5 text-slate-400">{index + 1}.</span>
                      {heading}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="space-y-7">
              {sections.map(([heading, text], index) => (
                <section key={heading} id={slug(heading)} className="scroll-mt-6">
                  <h2 className="font-semibold">
                    {index + 1}. {heading}
                  </h2>
                  {text ? (
                    <p className="mt-1 text-sm leading-relaxed text-slate-600">{text}</p>
                  ) : (
                    <address className="mt-1 text-sm not-italic leading-relaxed text-slate-600">
                      {LEGAL.companyName}
                      <br />
                      {LEGAL.address}
                      <br />
                      <a href={`mailto:${LEGAL.contactEmail}`} className="text-fuelo-coral hover:underline">
                        {LEGAL.contactEmail}
                      </a>
                    </address>
                  )}
                </section>
              ))}
              <p className="print:hidden">
                <a href="#top" className="text-sm font-semibold text-slate-500 hover:text-fuelo-ink">
                  Back to top
                </a>
              </p>
            </div>
          </div>
        </div>
      </main>
      <div className="print:hidden">
        <LoginFooter />
      </div>
    </div>
  );
}
