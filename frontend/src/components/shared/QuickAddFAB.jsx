import { Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
export default function QuickAddFAB() {
  const n = useNavigate();
  return (
    <button
      type="button"
      aria-label="New transaction"
      onClick={() => n("/transactions/new")}
      className="fixed bottom-20 right-4 z-30 grid h-14 w-14 place-items-center rounded-full bg-fuelo-coral text-white shadow-float md:hidden"
    >
      <Plus />
    </button>
  );
}
