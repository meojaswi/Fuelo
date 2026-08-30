export default function ExpiredLinkState() {
  return (
    <State title="Receipt link expired" text="This one-time receipt is no longer available." />
  );
}
function State({ title, text }) {
  return (
    <div className="mx-auto max-w-md rounded-[8px] bg-white p-10 text-center shadow-panel">
      <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-slate-100">×</div>
      <h1 className="mt-4 font-bold">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">{text}</p>
    </div>
  );
}
