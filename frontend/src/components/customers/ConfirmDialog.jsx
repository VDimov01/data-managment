import { useId } from "react";
import Modal from "../Modal"; // adjust the path

export default function ConfirmDialog({
  open = false,
  title = "Потвърждение",
  message = "",
  onCancel,
  onConfirm,
}) {
  const descId = useId();

  return (
    <Modal open={open} title={title} onClose={onCancel} maxWidth="min(480px, 95vw)">
      <div aria-describedby={descId}>
        <p id={descId} className="text-muted" style={{ margin: "0 0 12px" }}>
          {message}
        </p>
      </div>

      <div className="btn-row" style={{ justifyContent: "flex-end", marginTop: 8 }}>
        <button type="button" className="btn" onClick={onCancel}>
          Отказ
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm}>
          Изтрий
        </button>
      </div>
    </Modal>
  );
}
