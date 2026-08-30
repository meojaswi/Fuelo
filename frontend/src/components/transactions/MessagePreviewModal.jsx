import Modal from "../shared/Modal";
import Button from "../shared/Button";
export default function MessagePreviewModal({ open, onClose, message }) {
  return (
    <Modal open={open} onClose={onClose} title="Message preview">
      <div className="rounded-[8px] bg-slate-50 p-5 text-sm leading-6 text-slate-700">
        {message}
      </div>
      <div className="mt-5 flex justify-end">
        <Button onClick={onClose}>Close preview</Button>
      </div>
    </Modal>
  );
}
