export default function Toast({ message, type = "success", onClose }) {
  if (!message) return null;
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      className={`fixed bottom-20 right-4 z-50 flex items-center rounded-[8px] px-4 py-1 text-sm font-semibold text-white shadow-float md:bottom-6 ${type === "error" ? "bg-red-600" : "bg-fuelo-ink"}`}
    >
      {message}
      <button
        type="button"
        onClick={onClose}
        aria-label="Dismiss"
        className="ml-3 grid h-11 w-11 place-items-center"
      >
        ×
      </button>
    </div>
  );
}
