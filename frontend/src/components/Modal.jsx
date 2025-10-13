// Modal.jsx
import { useEffect } from "react";

export default function Modal({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div style={styles.backdrop} aria-modal="true" role="dialog" aria-label={title}>
      <div style={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button type="button" style={styles.close} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div style={styles.body}>{children}</div>
      </div>
    </div>
  );
}

const styles = {
  backdrop: { position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:999 },
  dialog:   { width:'min(1100px,95vw)', maxHeight:'85vh', background:'#fff', borderRadius:12, boxShadow:'0 10px 30px rgba(0,0,0,0.3)', display:'flex', flexDirection:'column', overflow:'hidden' },
  header:   { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:'1px solid #eee' },
  body:     { padding:12, overflow:'auto' },
  close:    { border:'none', background:'transparent', fontSize:24, cursor:'pointer', lineHeight:1 }
};
