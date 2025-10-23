import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { createPortal } from "react-dom";
import {
  getPublicVehicle,
  getPublicVehicleImages,
  getEditionAttributes,
} from "../services/api";
import EditionSpecsPanel from "./EditionSpecsPanel";


function Spinner() {
  return <div style={{ padding: 24 }}>Loading…</div>;
}

/** Navigable lightbox rendered in a portal (keyboard + swipe + buttons) */
function Lightbox({ open, images = [], index = 0, onClose, onPrev, onNext }) {
  const hasImages = images.length > 0;
  const safeIndex = images.length ? ((index % images.length) + images.length) % images.length : 0;
  const src = hasImages ? images[safeIndex] : null;

  // lock page scroll while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  // keyboard support
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
      else if (e.key === "ArrowLeft") onPrev?.();
      else if (e.key === "ArrowRight") onNext?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPrev, onNext]);

  // swipe support (simple)
  const [touchStartX, setTouchStartX] = useState(null);
  const onTouchStart = useCallback((e) => {
    if (!open) return;
    setTouchStartX(e.changedTouches?.[0]?.clientX ?? null);
  }, [open]);
  const onTouchEnd = useCallback((e) => {
    if (!open || touchStartX == null) return;
    const endX = e.changedTouches?.[0]?.clientX ?? touchStartX;
    const dx = endX - touchStartX;
    const THRESH = 40; // px
    if (dx > THRESH) onPrev?.();
    else if (dx < -THRESH) onNext?.();
    setTouchStartX(null);
  }, [open, touchStartX, onPrev, onNext]);

  if (!open || !hasImages) return null;

  const overlay = (
    <div className="public-lb" onClick={onClose}>
      <div className="public-lb__inner" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img className="public-lb__img" src={src} alt="" />

        <button type="button" className="public-lb__btn public-lb__btn--prev" onClick={onPrev} aria-label="Previous">
          ‹
        </button>
        <button type="button" className="public-lb__btn public-lb__btn--next" onClick={onNext} aria-label="Next">
          ›
        </button>

        <button type="button" className="public-lb__close" onClick={onClose} aria-label="Close">
          ✕
        </button>

        <div className="public-lb__counter">
          {safeIndex + 1} / {images.length}
        </div>
      </div>
    </div>
  );

  // Portal keeps it out of the normal tree (avoids the internal React warning)
  return createPortal(overlay, document.body);
}

const statusBG = {
  Available: "Наличен",
  Reserved: "Резервиран",
  Sold: "Продаден",
  InTransit: "В процес на доставка",
};

export default function VehiclePublicPage({ apiBase = "http://localhost:5000" }) {
  const { uuid } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [images, setImages] = useState([]);
  const [err, setErr] = useState(null);
  const [lightbox, setLightbox] = useState({ open: false, index: 0 });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        setVehicle(null);
        setImages([]);

        const v = await getPublicVehicle(apiBase, uuid);
        if (!alive) return;
        setVehicle(v);

        const [imgs] = await Promise.all([
          getPublicVehicleImages(apiBase, uuid).catch(() => []),
          // getEditionAttributes(apiBase, v.edition_id).catch(() => null),
        ]);
        if (!alive) return;
        setImages(Array.isArray(imgs) ? imgs : []);
      } catch (e) {
        if (!alive) return;
        setErr(e.message || "Failed to load");
      }
    })();
    return () => { alive = false; };
  }, [apiBase, uuid]);

  const title = useMemo(() => {
    if (!vehicle) return "Vehicle";
    const parts = [
      vehicle.make,
      vehicle.model,
      vehicle.model_year ? String(vehicle.model_year) : null,
      vehicle.edition_name,
    ].filter(Boolean);
    return parts.join(" ");
  }, [vehicle]);

  if (err) return <div style={{ padding: 24, color: "#b00020" }}>Error: {err}</div>;
  if (!vehicle) return <Spinner />;

  const urls = images.map((im) => im.stream_url).filter(Boolean);
  const primaryImg = urls[0] || null;

  const openAt = (idx) => setLightbox({ open: true, index: idx });
  const closeLb = () => setLightbox({ open: false, index: 0 });
  const prevLb = () => setLightbox((l) => ({ open: true, index: (l.index - 1 + urls.length) % urls.length }));
  const nextLb = () => setLightbox((l) => ({ open: true, index: (l.index + 1) % urls.length }));

  return (
    <div className="public-theme">
      <div className="public-container public-vp">
        {/* Header */}
        <div className="public-vp__hero">
          <div>
            <h1 className="public-vp__title">{title}</h1>
            <div className="public-vp__subtitle">
              {vehicle.stock_number ? <>Stock: <b>{vehicle.stock_number}</b> · </> : null}
              VIN …{vehicle.vin_last6 || "—"} · {statusBG[vehicle.status]}
            </div>
          </div>

          <div className="public-vp__cta">
            {vehicle.asking_price != null ? (
              <div className="public-vp__price">
                {Number(vehicle.asking_price).toLocaleString()} лв.
              </div>
            ) : (
              <div className="public-muted">Цена при запитване</div>
            )}
          </div>
        </div>

        {/* Gallery */}
        <section className="public-section" style={{ marginTop: 12 }}>
          <div className="public-section__body">
            <div className="public-card public-card--p8">
              {primaryImg ? (
                <img
                  src={primaryImg}
                  alt=""
                  className="public-heroimg"
                  onClick={() => openAt(0)}
                />
              ) : (
                <div className="public-none">No images</div>
              )}

              {urls.length > 1 && (
                <div className="public-gallery">
                  {images.map((im, i) => (
                    <div key={im.vehicle_image_id} className="public-gallery__item">
                      <img
                        src={im.stream_url}
                        alt=""
                        className="public-gallery__img"
                        loading="lazy"
                        onClick={() => openAt(i)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Key facts */}
        <section className="public-section">
          <div className="public-section__header">Основни параметри</div>
          <div className="public-section__body">
            <div className="public-kv">
              {vehicle.status ? (
                <div className="public-kv__item">
                  <div className="public-kv__label">Състояние</div>
                  <div className="public-kv__value">{statusBG[vehicle.status]}</div>
                </div>
              ) : null}

              {vehicle.mileage != null ? (
                <div className="public-kv__item">
                  <div className="public-kv__label">Пробег</div>
                  <div className="public-kv__value">
                    {vehicle.mileage.toLocaleString()} km
                  </div>
                </div>
              ) : null}

              {vehicle.exterior_color ? (
                <div className="public-kv__item">
                  <div className="public-kv__label">Екстериор</div>
                  <div className="public-kv__value">{vehicle.exterior_color}</div>
                </div>
              ) : null}

              {vehicle.interior_color ? (
                <div className="public-kv__item">
                  <div className="public-kv__label">Интериор</div>
                  <div className="public-kv__value">{vehicle.interior_color}</div>
                </div>
              ) : null}

              {vehicle.release_date ? (
                <div className="public-kv__item">
                  <div className="public-kv__label">Дата на производство</div>
                  <div className="public-kv__value">{vehicle.release_date}</div>
                </div>
              ) : null}
            </div>
          </div>
        </section>

        {/* Attributes */}
        <section className="public-section">
          <div className="public-section__header">Технически характеристики</div>
          <div className="public-section__body">
            <EditionSpecsPanel apiBase={apiBase} editionId={vehicle.edition_id} />
          </div>
        </section>

        {/* Lightbox */}
        <Lightbox
          open={lightbox.open}
          images={urls}
          index={lightbox.index}
          onClose={closeLb}
          onPrev={prevLb}
          onNext={nextLb}
        />
      </div>
    </div>
  );
}
