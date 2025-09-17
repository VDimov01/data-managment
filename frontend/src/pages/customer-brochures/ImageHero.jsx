export default function ImageHero({ image, fallbackLabel = "Издание" }) {
  return (
    <div className="cb-hero">
      {image?.image_url ? (
        <img className="cb-hero-img" src={image.image_url} alt="Основна снимка" />
      ) : (
        <div className="cb-hero-fallback">
          <div className="cb-hero-fallback-text">{fallbackLabel}</div>
        </div>
      )}
    </div>
  );
}
