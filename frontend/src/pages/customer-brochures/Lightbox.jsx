export default function Lightbox({ open, images = [], index = 0, title = "", onClose, onPrev, onNext }) {
  if (!open) return null;
  const cur = images[index];
  return (
    <div className="cb-lightbox" onClick={onClose}>
      <div className="cb-lightbox-inner" onClick={(e) => e.stopPropagation()}>
        <div className="cb-lightbox-top">
          <div className="cb-lightbox-title">{title}</div>
          <button className="cb-lightbox-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="cb-lightbox-body">
          <button className="cb-lightbox-nav left" onClick={onPrev} aria-label="Prev">‹</button>
          {cur ? (
            <img className="cb-lightbox-img" src={cur.image_url} alt={title} />
          ) : (
            <div className="cb-lightbox-missing">No image</div>
          )}
          <button className="cb-lightbox-nav right" onClick={onNext} aria-label="Next">›</button>
        </div>
        <div className="cb-lightbox-counter">
          {index + 1} / {images.length}
        </div>
      </div>
    </div>
  );
}
