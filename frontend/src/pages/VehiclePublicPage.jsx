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
    <div style={{ maxWidth: 1200, margin: "0 auto", padding: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{title}</h1>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            {vehicle.stock_number ? <>Stock: <b>{vehicle.stock_number}</b> · </> : null}
            VIN …{vehicle.vin_last6 || "—"} · {vehicle.status}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          {vehicle.asking_price != null ? (
            <div style={{ fontSize: 22, fontWeight: 700 }}>
              {Number(vehicle.asking_price).toLocaleString()} лв.
            </div>
          ) : <div style={{ fontSize: 14, opacity: 0.7 }}>Цена при запитване</div>}
          <a href={`tel:+359`} style={{ display: "inline-block", marginTop: 8, padding: "8px 12px",
            borderRadius: 8, border: "1px solid #222", textDecoration: "none", color: "#222" }}>
            Обади се
          </a>
        </div>
      </div>

      {/* Gallery */}
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 8, background: "#fff" }}>
          {primaryImg ? (
            <img
              src={primaryImg}
              alt=""
              style={{ width: "100%", height: 480, objectFit: "cover", borderRadius: 6, cursor: "zoom-in" }}
              onClick={() => setLightbox({ open: true, src: primaryImg })}
            />
          ) : (
            <div style={{ height: 480, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8f8", borderRadius: 6 }}>
              No images
            </div>
          )}
          {images.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 8, overflowX: "auto" }}>
              {images.map((im) => (
                <img
                  key={im.vehicle_image_id}
                  src={im.stream_url}
                  alt=""
                  onClick={() => setLightbox({ open: true, src: im.stream_url })}
                  style={{
                    width: 96, height: 72, objectFit: "cover",
                    borderRadius: 6, border: "2px solid transparent", cursor: "pointer"
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Key facts */}
        <div style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, background: "#fff" }}>
          <h3 style={{ marginTop: 0 }}>Key facts</h3>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            {vehicle.status ? <li>Състояние: {vehicle.status}</li> : null}
            {vehicle.mileage != null ? <li>Пробег: {vehicle.mileage.toLocaleString()} km</li> : null}
            {vehicle.exterior_color ? <li>Екстериор: {vehicle.exterior_color}</li> : null}
            {vehicle.interior_color ? <li>Интериор: {vehicle.interior_color}</li> : null}
          </ul>
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
            ID: {vehicle.public_uuid}
          </div>
        </div>
      </div>

      {/* Attributes */}
      <div style={{ marginTop: 16, border: "1px solid #eee", borderRadius: 8, background: "#fff" }}>
        <EditionSpecsPanel apiBase={apiBase} editionId={vehicle.edition_id} />
      </div>

      <Lightbox open={lightbox.open} src={lightbox.src} onClose={() => setLightbox({ open: false, src: null })} />
    </div>
  );
}

