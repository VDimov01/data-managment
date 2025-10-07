import { useEffect, useState } from "react";
import EditionPicker from "./EditionPicker";

/* ======================= Brochure Form ======================= */

export default function BrochureForm({ apiBase, initial = null, onSaved }) {
  const isEdit = !!initial;

  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [language, setLanguage] = useState(initial?.language || "bg");
  const [onlyDiff, setOnlyDiff] = useState(!!initial?.only_differences);
  const [snapshot, setSnapshot] = useState(!!initial?.is_snapshot);

  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [years, setYears]   = useState([]);
  const [editions, setEditions] = useState([]);

  const [makeId, setMakeId] = useState(initial?.make_id ? String(initial.make_id) : "");
  const [modelId, setModelId] = useState(initial?.model_id ? String(initial.model_id) : "");

  const [selectionMode, setSelectionMode] = useState(initial?.selection_mode || "ALL_YEARS");
  const [selectedYearIds, setSelectedYearIds] = useState(new Set());
  const [selectedEditionIds, setSelectedEditionIds] = useState(new Set());

  // load makes
  useEffect(() => {
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/makes`);
      const data = await r.json();
      setMakes(data || []);
    })().catch(console.error);
  }, [apiBase]);

  // load models by make
  useEffect(() => {
    setModels([]); setModelId(""); setYears([]); setEditions([]);
    if (!makeId) return;
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/models?make_id=${makeId}`);
      setModels(await r.json());
    })().catch(console.error);
  }, [makeId, apiBase]);

  // load years by model
  useEffect(() => {
    setYears([]); setEditions([]);
    if (!modelId) return;
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/model-years?model_id=${modelId}`);
      setYears(await r.json());
    })().catch(console.error);
  }, [modelId, apiBase]);

  // When editing, fetch selection (year_ids / edition_ids) if endpoint exists
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/brochures/${initial.brochure_id}/selection`);
        if (!r.ok) return; // optional endpoint; skip gracefully
        const sel = await r.json();
        if (sel.selection_mode) setSelectionMode(sel.selection_mode);
        if (Array.isArray(sel.year_ids)) setSelectedYearIds(new Set(sel.year_ids.map(String)));
        if (Array.isArray(sel.edition_ids)) setSelectedEditionIds(new Set(sel.edition_ids.map(String)));
      } catch {}
    })();
  }, [isEdit, initial, apiBase]);

  useEffect(() => {
  if (!initial) return;
  setTitle(initial.title || "");
  setDescription(initial.description || "");
  setLanguage(initial.language || "bg");
  setOnlyDiff(!!initial.only_differences);
  setSnapshot(!!initial.is_snapshot);
  setMakeId(initial.make_id ? String(initial.make_id) : "");
  setModelId(initial.model_id ? String(initial.model_id) : "");
  setSelectionMode(initial.selection_mode || "ALL_YEARS");
}, [initial]);

  // load editions for a chosen year (helper)
  const loadEditionsForYear = async (model_year_id) => {
    const r = await fetch(`${apiBase}/api/cascade/editions?model_year_id=${model_year_id}`);
    const list = await r.json();
    // Merge into editions pool (unique by edition_id)
    setEditions(prev => {
      const map = new Map(prev.map(e => [e.edition_id, e]));
      list.forEach(e => map.set(e.edition_id, e));
      return Array.from(map.values());
    });
  };

  const toggleYear = async (y) => {
    const id = String(y.model_year_id);
    setSelectedYearIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
    // If EDITIONS mode, loading editions for that year helps user pick
    if (selectionMode === "EDITIONS") {
      await loadEditionsForYear(y.model_year_id);
    }
  };

  const toggleEdition = (e) => {
    const id = String(e.edition_id);
    setSelectedEditionIds(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });
  };

  const save = async () => {
    if (!title.trim()) return alert("Заглавието е задължително");
    if (!makeId || !modelId) return alert("Изберете производител и модел");

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      make_id: Number(makeId),
      model_id: Number(modelId),
      selection_mode: selectionMode,
      only_differences: onlyDiff ? 1 : 0,
      language,
      snapshot: snapshot ? 1 : 0
    };

    if (selectionMode === "YEARS") {
      body.year_ids = Array.from(selectedYearIds).map(Number);
    } else if (selectionMode === "EDITIONS") {
      body.edition_ids = Array.from(selectedEditionIds).map(Number);
    }

    try {
      let r;
      if (isEdit) {
        r = await fetch(`${apiBase}/api/brochures/${initial.brochure_id}`, {
          method: "PUT",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify(body)
        });
      } else {
        r = await fetch(`${apiBase}/api/brochures`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify(body)
        });
      }
      const data = await r.json().catch(()=>null);
      if (!r.ok) {
        console.error(data);
        return alert(data?.error || "Неуспешно записване");
      }
      onSaved?.();
    } catch (e) {
      console.error(e); alert("Неуспешно записване");
    }
  };

  return (
    <div className="br-form">
      <div className="br-grid">
        <div>
          <label>Заглавие *</label>
          <input value={title} onChange={(e)=>setTitle(e.target.value)} />
        </div>
        <div>
          <label>Език</label>
          <select value={language} onChange={e=>setLanguage(e.target.value)}>
            <option value="bg">BG</option>
            <option value="en">EN</option>
          </select>
        </div>
        <div>
          <label>Само разлики</label>
          <div className="br-check">
            <input type="checkbox" checked={onlyDiff} onChange={()=>setOnlyDiff(v=>!v)} />
            <span>Покажи само различаващи се атрибути</span>
          </div>
        </div>
        <div>
          <label>Snapshot</label>
          <div className="br-check">
            <input type="checkbox" checked={snapshot} onChange={()=>setSnapshot(v=>!v)} />
            <span>Замрази данните в брошурата</span>
          </div>
        </div>

        <div className="br-col-2">
          <label>Описание</label>
          <textarea rows={2} value={description} onChange={e=>setDescription(e.target.value)} />
        </div>

        <div>
          <label>Производител *</label>
          <select value={makeId} onChange={(e)=>setMakeId(e.target.value)}>
            <option value="">Изберете производител…</option>
            {makes.map(m => <option key={m.make_id} value={m.make_id}>{m.name}</option>)}
          </select>
        </div>

        <div>
          <label>Модел *</label>
          <select value={modelId} onChange={(e)=>setModelId(e.target.value)} disabled={!makeId}>
            <option value="">Изберете модел…</option>
            {models.map(m => <option key={m.model_id} value={m.model_id}>{m.name}</option>)}
          </select>
        </div>
      </div>

      <fieldset className="br-fieldset">
        <legend>Вид брошура</legend>
        <div className="br-row">
          <label className="br-radio">
            <input
              type="radio"
              name="selmode"
              value="ALL_YEARS"
              checked={selectionMode === "ALL_YEARS"}
              onChange={()=>setSelectionMode("ALL_YEARS")}
            />
            <span>Всички издания</span>
          </label>
          <label className="br-radio">
            <input
              type="radio"
              name="selmode"
              value="YEARS"
              checked={selectionMode === "YEARS"}
              onChange={()=>setSelectionMode("YEARS")}
            />
            <span>По избрани години</span>
          </label>
          <label className="br-radio">
            <input
              type="radio"
              name="selmode"
              value="EDITIONS"
              checked={selectionMode === "EDITIONS"}
              onChange={()=>setSelectionMode("EDITIONS")}
            />
            <span>По избрани издания</span>
          </label>
        </div>

        {selectionMode === "YEARS" && (
          <div className="br-chipbox">
            {years.length === 0 && <p className="br-muted">Изберете модел, за да заредите години…</p>}
            {years.map(y => {
              const on = selectedYearIds.has(String(y.model_year_id));
              return (
                <button
                  key={y.model_year_id}
                  type="button"
                  className={`br-chip ${on ? "on" : ""}`}
                  onClick={() => toggleYear(y)}
                >
                  {y.year}
                </button>
              );
            })}
          </div>
        )}

        {selectionMode === "EDITIONS" && (
          <>
            <p className="br-muted">Изберете една или повече години, за да заредите техните издания; след това изберете издания по-долу.</p>
            <div className="br-chipbox">
              {years.map(y => {
                const on = selectedYearIds.has(String(y.model_year_id));
                return (
                  <button
                    key={y.model_year_id}
                    type="button"
                    className={`br-chip ${on ? "on" : ""}`}
                    onClick={() => toggleYear(y)}
                  >
                    {y.year}
                  </button>
                );
              })}
            </div>

            <div className="br-listbox">
              {Array.from(selectedYearIds).length === 0 && (
                <div className="br-muted">Изберете поне една година, за да покажете издания.</div>
              )}
              {Array.from(selectedYearIds).length > 0 && (
                <EditionPicker
                  apiBase={apiBase}
                  selectedYearIds={Array.from(selectedYearIds)}
                  selectedEditionIds={selectedEditionIds}
                  onToggleEdition={toggleEdition}
                />
              )}
            </div>
          </>
        )}
      </fieldset>

      <div className="br-actions-end">
        <button className="br-primary" onClick={save}>{isEdit ? "Запази промените" : "Създай брошура"}</button>
      </div>
    </div>
  );
}