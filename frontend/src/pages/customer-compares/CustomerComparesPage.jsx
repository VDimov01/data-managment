// CustomerComparesPage.jsx
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import CompareTable from "../customer-brochures/CompareTable";

export default function CustomerComparesPage({ apiBase = "http://localhost:5000" }) {
  const { uuid } = useParams();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [compares, setCompares] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // compare_id -> images[]
  const [imagesByCompare, setImagesByCompare] = useState({});

  const [onlyDiff, setOnlyDiff] = useState(false);
  const [attrFilter, setAttrFilter] = useState("");

  // Replace "-" with space, collapse extra spaces, URL-encode
  const safe = (s) =>
    encodeURIComponent(
      String(s ?? "")
        .trim()
        .replace(/-/g, " ")
        .replace(/\s+/g, " ")
    );

  // Fetch compares for the customer
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const r = await fetch(`${apiBase}/api/public/customers/${uuid}/compares`);
        const data = await r.json();
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        if (cancelled) return;
        setCompares(Array.isArray(data) ? data : []);
        // pick first as active
        if (Array.isArray(data) && data.length && !activeId) {
          setActiveId(String(data[0].compare_id));
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setErr(e.message || "Failed to load compares");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, uuid]);

  // Prefetch images for all compares (using first edition as the folder hint)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = {};
      await Promise.all((compares || []).map(async (c) => {
        const firstEd = c?.data?.editions?.[0];
        if (!firstEd) { map[c.compare_id] = []; return; }
        try {
          const url = `${apiBase}/api/car-images/${firstEd.edition_id}-${safe(firstEd.make_name)}-${safe(firstEd.model_name)}-${safe(firstEd.year)}`;
          const r = await fetch(url);
          const j = await r.json();
          map[c.compare_id] = Array.isArray(j?.images) ? j.images : [];
        } catch {
          map[c.compare_id] = [];
        }
      }));
      if (!cancelled) setImagesByCompare(map);
    })();
    return () => { cancelled = true; };
  }, [apiBase, compares]);

  const active = useMemo(
    () => compares.find(c => String(c.compare_id) === String(activeId)) || null,
    [compares, activeId]
  );

  const images = imagesByCompare[activeId] || [];
  const imgGroups = {
    main: images.filter(i => i.part === "main"),
    exterior: images.filter(i => i.part === "exterior"),
    interior: images.filter(i => i.part === "interior"),
  };

  return (
    <div className="cb-container">
      <header className="cb-header">
        <h1>Сравнения</h1>
      </header>

      {loading && <p className="cb-muted">Зареждане…</p>}
      {err && <p className="cb-error">Грешка: {err}</p>}

      {!loading && !err && compares.length === 0 && (
        <div className="cb-empty">
          <h3>Няма налични сравнения</h3>
          <p>Свържете се с вашия търговец за повече информация.</p>
        </div>
      )}

      {!loading && !err && compares.length > 0 && (
        <>
          {/* Tabs */}
          <div className="cb-tabs">
            {compares.map(c => (
              <button
                key={c.compare_id}
                className={`cb-tab ${String(activeId) === String(c.compare_id) ? "on" : ""}`}
                onClick={() => setActiveId(String(c.compare_id))}
              >
                {c.title || `Compare #${c.compare_id}`}
              </button>
            ))}
          </div>

          {/* Controls */}
          {active && (
            <div className="cb-controls">
              <div className="cb-left">
                <input
                  className="cb-input"
                  placeholder="Търси по атрибут/код/секция…"
                  value={attrFilter}
                  onChange={(e) => setAttrFilter(e.target.value)}
                />
              </div>
              <div className="cb-right">
                <label className="cb-check">
                  <input type="checkbox" checked={onlyDiff} onChange={() => setOnlyDiff(v => !v)} />
                  <span>Показвай само разлики</span>
                </label>
              </div>
            </div>
          )}

          {/* Compare table */}
          {active && (
            <CompareTable
              editions={active.data?.editions || []}
              rows={active.data?.rows || []}
              onlyDiff={onlyDiff}
              filter={attrFilter}
              imgGroups={imgGroups}
            />
          )}
        </>
      )}
    </div>
  );
}
