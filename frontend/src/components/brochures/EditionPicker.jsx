import { useEffect, useState } from "react";
import {api, qs} from '../../services/api.js'

/* =================== Edition Picker =================== */

export default function EditionPicker({ apiBase, selectedYearIds, selectedEditionIds, onToggleEdition, years }) {
  const [map, setMap] = useState(new Map()); // year_id -> editions[]
  console.log(years);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const m = new Map();
      for (const y of selectedYearIds) {
        const list = await api(`/cascade/editions${qs({model_year_id: y})}`);
        if (cancelled) return;
        m.set(String(y), list || []);
      }
      setMap(m);
    })().catch(console.error);
    return () => { cancelled = true; };
  }, [apiBase, selectedYearIds]);

  const yearsFromMap = Array.from(map.keys());

  return (
    <>
      {yearsFromMap.map((y, idx) => {
        const list = map.get(String(y)) || [];
        return (
          <div key={y} className="br-year-group">
            <div className="br-year-title">Година на модел: {years.find(yr => yr.model_year_id === Number(y))?.year || "000"}</div>
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