// frontend/src/pages/customer-brochures/CustomerBrochuresPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import CompareTable from "./CompareTable";
import ImageHero from "./ImageHero";
import ImageGallery from "./ImageGallery";
import Lightbox from "./Lightbox";
import { listEditionImages } from "../../services/api";

export default function CustomerBrochuresPage({ apiBase = "http://localhost:5000" }) {
  const { uuid } = useParams();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [brochures, setBrochures] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // cache of images per brochure_id
  const [imagesByBrochure, setImagesByBrochure] = useState({});

  // local-only compare options
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [attrFilter, setAttrFilter] = useState("");

  // --- helpers ---
  const groupImages = (images) => {
    const imgs = Array.isArray(images) ? images : [];

    // The backend already orders by: is_primary DESC, part-rank, sort_order, id
    // Still, we’ll explicitly group for clarity.
    const primary = imgs.find(x => Number(x.is_primary) === 1) || null;

    const main = primary
      ? [primary]
      : imgs.filter(x => (x.part || "") === "main");

    const exterior = imgs.filter(x => (x.part || "unsorted") === "exterior");
    const interior = imgs.filter(x => (x.part || "unsorted") === "interior");
    const unsorted = imgs.filter(x => (x.part || "unsorted") === "unsorted");
    return { main, exterior, interior, unsorted };
  };

  // Load brochures, then prefetch images for each brochure’s first edition
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch(`${apiBase}/api/public/customers/${uuid}/brochures`);
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);

        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setBrochures(list);
        if (list.length) setActiveId(String(list[0].brochure_id));

        // Prefetch images for the first edition per brochure (if present)
        const entries = await Promise.all(
          list.map(async (b) => {
            const brochureId = String(b.brochure_id);
            const ed = b?.data?.editions?.[0];
            console.log("Prefetching images for brochure", brochureId, "edition", ed);
            if (!ed) return [brochureId, { main: [], exterior: [], interior: [], unsorted: [] }];

            // Use your helper (it builds the slug route internally)
            try {
              const resp = await listEditionImages(
                apiBase,
                ed.edition_id,
                ed.make_name,
                ed.model_name,
                ed.year
              );
              console.log("Prefetched images for brochure", brochureId, resp);
              const groups = groupImages(resp?.images);
              return [brochureId, groups];
            } catch (e) {
              console.error("Images fetch failed for brochure", brochureId, e);
              return [brochureId, { main: [], exterior: [], interior: [], unsorted: [] }];
            }
          })
        );

        if (cancelled) return;
        const map = {};
        for (const [id, groups] of entries) map[id] = groups;
        setImagesByBrochure(map);
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr(e.message || "Failed to load brochures");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [apiBase, uuid]);

  const active = useMemo(
    () => brochures.find(b => String(b.brochure_id) === String(activeId)) || null,
    [brochures, activeId]
  );

  const imgGroups = useMemo(
    () => imagesByBrochure[String(activeId)] || { main: [], exterior: [], interior: [], unsorted: [] },
    [imagesByBrochure, activeId]
  );

  // Lightbox state
  const [lightbox, setLightbox] = useState({ open:false, images:[], index:0, title:"" });
  const openLightbox = (images, index, title) => setLightbox({ open:true, images, index, title });
  const closeLightbox = () => setLightbox(s => ({ ...s, open:false }));
  const prevLight = () =>
    setLightbox(s => ({ ...s, index: (s.index - 1 + s.images.length) % s.images.length }));
  const nextLight = () =>
    setLightbox(s => ({ ...s, index: (s.index + 1) % s.images.length }));

  // Keyboard support for lightbox
  useEffect(() => {
    if (!lightbox.open) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") prevLight();
      if (e.key === "ArrowRight") nextLight();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox.open]);

  return (
    <div className="cb-container">
      <header className="cb-header">
        <h1>Брошури</h1>
      </header>

      {loading && <p className="cb-muted">Зареждане…</p>}
      {err && <p className="cb-error">Грешка: {err}</p>}

      {!loading && !err && brochures.length === 0 && (
        <div className="cb-empty">
          <h3>Няма налични брошури</h3>
          <p>Свържете се с вашия търговец за повече информация.</p>
        </div>
      )}

      {!loading && !err && brochures.length > 0 && (
        <div className="cb-layout">
          {/* Sticky side nav (hidden on small screens) */}
          <aside className="cb-sidenav">
            <div className="cb-sidenav-card">
              <div className="cb-sidenav-title">Навигация</div>
              <a href="#hero" className="cb-sidenav-link">Основна снимка</a>
              <a href="#compare" className="cb-sidenav-link">Сравнение</a>
              <a href="#exterior" className="cb-sidenav-link">
                Екстериор {imgGroups.exterior?.length ? `(${imgGroups.exterior.length})` : ""}
              </a>
              <a href="#interior" className="cb-sidenav-link">
                Интериор {imgGroups.interior?.length ? `(${imgGroups.interior.length})` : ""}
              </a>
            </div>
          </aside>

          <main className="cb-main">
            {/* Tabs */}
            <div className="cb-tabs">
              {brochures.map(b => (
                <button
                  key={b.brochure_id}
                  className={`cb-tab ${String(activeId) === String(b.brochure_id) ? "on" : ""}`}
                  onClick={() => setActiveId(String(b.brochure_id))}
                >
                  {b.title || `Brochure #${b.brochure_id}`}
                </button>
              ))}
            </div>

            {/* Controls */}
            {active && (
              <div className="cb-controls">
                <div className="cb-left">
                  <input
                    className="cb-input"
                    placeholder="Търси по атрибут/секция…"
                    value={attrFilter}
                    onChange={(e) => setAttrFilter(e.target.value)}
                  />
                </div>
                <div className="cb-right">
                  <label className="cb-check">
                    <input
                      type="checkbox"
                      checked={onlyDiff}
                      onChange={() => setOnlyDiff(v => !v)}
                    />
                    <span>Показвай само разлики</span>
                  </label>
                </div>
              </div>
            )}

            {/* HERO */}
            <section id="hero" className="cb-section-block">
              <ImageHero
                image={imgGroups.main?.[0] || null}
                fallbackLabel={active?.data?.editions?.[0]
                  ? `${active.data.editions[0].make_name} ${active.data.editions[0].model_name} ${active.data.editions[0].year}`
                  : "Издание"}
              />
            </section>

            {/* COMPARE */}
            <section id="compare" className="cb-section-block">
              {active && (
                <CompareTable
                  editions={active.data?.editions || []}
                  rows={active.data?.rows || []}
                  onlyDiff={onlyDiff}
                  filter={attrFilter}
                />
              )}
            </section>

            {/* GALLERIES */}
            <section id="exterior" className="cb-section-block">
              {imgGroups.exterior?.length > 0 && (
                <ImageGallery
                  title="Външни снимки"
                  images={imgGroups.exterior}
                  onOpen={(idx) => openLightbox(imgGroups.exterior, idx, "Екстериор")}
                />
              )}
            </section>

            <section id="interior" className="cb-section-block">
              {imgGroups.interior?.length > 0 && (
                <ImageGallery
                  title="Вътрешни снимки"
                  images={imgGroups.interior}
                  onOpen={(idx) => openLightbox(imgGroups.interior, idx, "Интериор")}
                />
              )}
            </section>
          </main>
        </div>
      )}

      {/* LIGHTBOX */}
      <Lightbox
        open={lightbox.open}
        images={lightbox.images}
        index={lightbox.index}
        title={lightbox.title}
        onClose={closeLightbox}
        onPrev={prevLight}
        onNext={nextLight}
      />
    </div>
  );
}
