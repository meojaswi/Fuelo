import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { useOnboarding } from "../../hooks/useOnboarding";
import Button from "../shared/Button";

export default function GetStartedCard() {
  const { steps, hidden, hide } = useOnboarding();
  if (hidden || !steps?.length) return null;
  const required = steps.filter((step) => !step.optional);
  const doneCount = required.filter((step) => step.done).length;
  if (doneCount === required.length) return null;
  return (
    <section aria-labelledby="get-started-title" className="panel space-y-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mono-label">Get started</p>
          <h3 id="get-started-title" className="mt-1 font-bold">
            Finish setting up your workspace.
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {doneCount} of {required.length} steps done
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={hide}>
          Hide checklist
        </Button>
      </div>
      <progress
        className="w-full accent-fuelo-coral"
        max={required.length}
        value={doneCount}
        aria-label="Setup progress"
      />
      <ul className="divide-y divide-slate-100">
        {steps.map((step) => (
          <li key={step.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 items-start gap-3">
              <span
                aria-hidden="true"
                className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${
                  step.done
                    ? "border-fuelo-ink bg-fuelo-ink text-white"
                    : "border-slate-300 text-transparent"
                }`}
              >
                <Check size={14} />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  {step.title}
                  <span className="ml-2 text-xs font-medium text-slate-600">
                    {step.done ? "Done" : step.optional ? "Optional" : "To do"}
                  </span>
                </p>
                <p className="text-xs text-slate-600">{step.hint}</p>
              </div>
            </div>
            {!step.done && (
              <Link
                to={step.to}
                className="inline-flex min-h-11 items-center rounded-[8px] border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Open
              </Link>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
