export default function ImageGallery({ title, images = [], onOpen }) {
  if (!images.length) return null;
  return (
    <div className="cb-gallery">
      <h3 className="cb-gallery-title">{title}</h3>
      <div className="cb-gallery-grid">
        {images.map((img, idx) => (
          <button
            key={img.id || idx}
            className="cb-thumb"
            onClick={() => onOpen(idx)}
            aria-label={`Open ${title} image ${idx + 1}`}
          >
            <img src={img.image_url} alt={`${title} ${idx + 1}`} />
          </button>
        ))}
      </div>
    </div>
  );
}
