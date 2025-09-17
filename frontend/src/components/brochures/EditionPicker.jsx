import { useEffect, useState } from "react";

/* =================== Edition Picker =================== */

export default function EditionPicker({ apiBase, selectedYearIds, selectedEditionIds, onToggleEdition }) {
  const [map, setMap] = useState(new Map()); // year_id -> editions[]

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = new Map();
      for (const y of selectedYearIds) {
        const r = await fetch(`${apiBase}/api/cascade/editions?model_year_id=${y}`);
        const list = await r.json();
        if (cancelled) return;
        m.set(String(y), list || []);
      }
      setMap(m);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [apiBase, selectedYearIds]);

  const years = Array.from(map.keys());

  return (
    <>
      {years.map(y => {
        const list = map.get(String(y)) || [];
        return (
          <div key={y} className="br-year-group">
            <div className="br-year-title">Year {list[0]?.year ?? ""}</div>
            <div className="br-editions-grid">
              {list.map(e => {
                const on = selectedEditionIds.has(String(e.edition_id));
                return (
                  <label key={e.edition_id} className={`br-ed-item ${on ? "on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggleEdition(e)}
                    />
                    <span>{e.name}</span>
                  </label>
                );
              })}
              {list.length === 0 && <div className="br-muted">No editions</div>}
            </div>
          </div>
        );
      })}
    </>
  );
}