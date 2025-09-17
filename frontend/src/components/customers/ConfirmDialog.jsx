export default function ConfirmDialog({ title = "Are you sure?", message, onCancel, onConfirm }) {
  return (
    <div className="cust-modal-overlay" onMouseDown={(e) => { if (e.target.classList.contains("cust-modal-overlay")) onCancel?.(); }}>
      <div className="cust-modal small" role="dialog" aria-modal="true">
        <div className="cust-modal-header">
          <h3>{title}</h3>
          <button className="cust-icon-btn" onClick={onCancel} aria-label="Close">×</button>
        </div>
        <div className="cust-confirm-body">
          <p>{message}</p>
        </div>
        <div className="cust-actions">
          <button className="cust-btn" onClick={onCancel}>Cancel</button>
          <button className="cust-btn danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}
