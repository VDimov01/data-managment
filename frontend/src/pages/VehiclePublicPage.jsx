import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  getPublicVehicle,
  getPublicVehicleImages,
  getEditionAttributes,
} from "../services/api";
import EditionSpecsPanel from "./EditionSpecsPanel";

function Spinner() {
  return <div style={{ padding: 24 }}>Loading…</div>;
}

function Lightbox({ open, src, onClose }) {
  if (!open) return null;
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000
      }}
    >
      <img src={src} alt="" style={{ maxWidth: "90vw", maxHeight: "90vh", boxShadow: "0 0 24px rgba(0,0,0,0.5)" }} />
    </div>
  );
}

export default function VehiclePublicPage({ apiBase = "http://localhost:5000" }) {
  const { uuid } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [images, setImages] = useState([]);
  const [attrs, setAttrs] = useState(null);
  const [err, setErr] = useState(null);
  const [lightbox, setLightbox] = useState({ open: false, src: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setErr(null);
        setVehicle(null);
        setImages([]);
        //setAttrs(null);

        const v = await getPublicVehicle(apiBase, uuid);
        if (!alive) return;
        setVehicle(v);

        // fetch images + attributes in parallel
        const [imgs, at] = await Promise.all([
          getPublicVehicleImages(apiBase, uuid).catch(() => []),
          //getEditionAttributes(apiBase, v.edition_id).catch(() => null),
        ]);;
        if (!alive) return;
        setImages(Array.isArray(imgs) ? imgs : []);
        //setAttrs(at);
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
      vehicle.edition_name
    ].filter(Boolean);
    return parts.join(" ");
  }, [vehicle]);

  if (err) return <div style={{ padding: 24, color: "#b00020" }}>Error: {err}</div>;
  if (!vehicle) return <Spinner />;

  const primaryImg = images[0]?.stream_url || null;

  return (
  <div className="public-theme">
    <div className="public-container public-vp">
      {/* Header */}
      <div className="public-vp__hero">
        <div>
          <h1 className="public-vp__title">{title}</h1>
          <div className="public-vp__subtitle">
            {vehicle.stock_number ? <>Stock: <b>{vehicle.stock_number}</b> · </> : null}
            VIN …{vehicle.vin_last6 || "—"} · {vehicle.status}
          </div>
        </div>

        <div>
          {vehicle.asking_price != null ? (
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {Number(vehicle.asking_price).toLocaleString()} лв.
            </div>
          ) : (
            <div className="public-muted">Цена при запитване</div>
          )}
          <a
            href={`tel:+359`}
            className="public-btn public-btn--primary"
            style={{ marginTop: 8, display: "inline-block" }}
          >
            Обади се
          </a>
        </div>
      </div>

      {/* Gallery */}
      <section className="public-section" style={{ marginTop: 12 }}>
        <div className="public-section__body">
          <div className="public-card" style={{ padding: 8 }}>
            {primaryImg ? (
              <img
                src={primaryImg}
                alt=""
                className="public-gallery__img"
                style={{ height: 480, cursor: "zoom-in" }}
                onClick={() => setLightbox({ open: true, src: primaryImg })}
              />
            ) : (
              <div
                className="public-card"
                style={{
                  height: 480,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                No images
              </div>
            )}

            {images.length > 1 && (
              <div className="public-gallery" style={{ marginTop: 8, overflowX: "auto" }}>
                {images.map((im) => (
                  <div key={im.vehicle_image_id} className="public-gallery__item">
                    <img
                      src={im.stream_url}
                      alt=""
                      className="public-gallery__img"
                      style={{ aspectRatio: "4/3", cursor: "pointer" }}
                      onClick={() => setLightbox({ open: true, src: im.stream_url })}
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
                <div className="public-kv__value">{vehicle.status}</div>
              </div>
            ) : null}

            {vehicle.mileage != null ? (
              <div className="public-kv__item">
                <div className="public-kv__label">Пробег</div>
                <div className="public-kv__value">{vehicle.mileage.toLocaleString()} km</div>
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

            <div className="public-kv__item">
              <div className="public-kv__label">ID</div>
              <div className="public-kv__value public-mono">{vehicle.public_uuid}</div>
            </div>
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

      <Lightbox
        open={lightbox.open}
        src={lightbox.src}
        onClose={() => setLightbox({ open: false, src: null })}
      />
    </div>
  </div>
);

}

