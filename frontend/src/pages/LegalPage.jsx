import LoginFooter from "../components/shared/LoginFooter";
import LoginHeader from "../components/shared/LoginHeader";

const PAGES = {
  terms: {
    title: "Terms of service",
    sections: [
      ["Using Fuelo", "Placeholder text. Describe who may use the service and what they agree to."],
      ["Accounts and workspaces", "Placeholder text. Describe account ownership and member access."],
      ["Plans and billing", "Placeholder text. Describe plans, renewals, refunds and cancellation."],
      ["Limits of liability", "Placeholder text. Describe warranties and liability limits."],
    ],
  },
  privacy: {
    title: "Privacy policy",
    sections: [
      ["What we collect", "Placeholder text. List the data stored, such as customer names and phone numbers."],
      ["How we use it", "Placeholder text. Describe receipts, reminders and reports."],
      ["Who we share it with", "Placeholder text. Name messaging and payment providers."],
      ["Your choices", "Placeholder text. Describe access, correction and deletion requests."],
    ],
  },
};

export default function LegalPage({ kind }) {
  const page = PAGES[kind];
  return (
    <div className="flex min-h-screen flex-col bg-fuelo-surface text-white">
      <LoginHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <div className="bg-white p-6 text-fuelo-ink sm:p-10">
          <p
            role="note"
            className="mb-6 rounded-[8px] border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900"
          >
            Placeholder, to be replaced by real legal text. Do not rely on this page.
          </p>
          <h1 className="text-2xl font-bold">{page.title}</h1>
          <div className="mt-6 space-y-5">
            {page.sections.map(([heading, text]) => (
              <section key={heading}>
                <h2 className="font-semibold">{heading}</h2>
                <p className="mt-1 text-sm text-slate-600">{text}</p>
              </section>
            ))}
          </div>
        </div>
      </main>
      <LoginFooter />
    </div>
  );
}
