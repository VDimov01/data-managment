// Modal.jsx
import { useEffect, useRef } from "react";

export default function Modal({ open, title, onClose, children, maxWidth }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
     className="modal-backdrop"
     role="dialog"
     aria-modal="true"
     aria-label={title}
    >
      <div
      className="modal"
      ref={dialogRef}
      style={{width: maxWidth || 'min(1100px,95vw)' }}
      onMouseDown={(e) => e.stopPropagation()} // keep clicks inside dialog from closing
      >
          <div className="modal__header">
            <h3 className="modal__title">{title}</h3>
            <button type="button" className="modal__close" onClick={onClose} aria-label="Close">×</button>
          </div>
          <div className="modal__body">{children}</div>
      </div>
    </div>
  );
}

    //  <div
    //   className="modal-backdrop"
    //   role="dialog"
    //   aria-modal="true"
    //   aria-label={title}
    //   onMouseDown={onClose}              // close on outside click
    // >

    // </div>
