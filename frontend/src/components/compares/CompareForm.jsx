import { useEffect, useState } from "react";
import { api, qs } from "../../services/api";

export default function CompareForm({ apiBase, initial = null, onSaved }) {
  const isEdit = !!initial;

  const [title, setTitle] = useState(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [language, setLanguage] = useState(initial?.language || "bg");
  const [onlyDiff, setOnlyDiff] = useState(!!initial?.only_differences);
  const [snapshot, setSnapshot] = useState(!!initial?.is_snapshot);

  // cascade pickers
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  const [listEditions, setListEditions] = useState([]);

  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [yearId, setYearId] = useState("");

  // basket of selected editions
  const [selected, setSelected] = useState([]);

  // load makes
  useEffect(() => {
    (async () => {
      try {
        const data = await api(`/cascade/makes`);
        setMakes(data || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // load models by make
  useEffect(() => {
    setModels([]); setModelId(""); setYears([]); setYearId(""); setListEditions([]);
    if (!makeId) return;
    (async () => {
      try {
        const data = await api(`/cascade/models${qs({ make_id: makeId })}`);
        setModels(data || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [makeId]);

  // load years by model
  useEffect(() => {
    setYears([]); setYearId(""); setListEditions([]);
    if (!modelId) return;
    (async () => {
      try {
        const data = await api(`/cascade/model-years${qs({ model_id: modelId })}`);
        setYears(data || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [modelId]);

  // load editions by year
  useEffect(() => {
    setListEditions([]);
    if (!yearId) return;
    (async () => {
      try {
        const data = await api(`/cascade/editions${qs({ model_year_id: yearId })}`);
        setListEditions(data || []);
      } catch (e) {
        console.error(e);
      }
    })();
  }, [yearId]);

  // prefill when editing
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        // selection info for this compare
        const sel = await api(`/compares/${initial.compare_id}/selection`);

        // resolve edition metadata (to render chips nicely)
        if (Array.isArray(sel.edition_ids) && sel.edition_ids.length > 0) {
          const cmp = await api(`/editions/compare`, {
            method: "POST",
            body: { edition_ids: sel.edition_ids, only_differences: 0 },
          });
          const eds = cmp?.editions || [];
          setSelected(
            eds.map(e => ({
              edition_id: e.edition_id,
              edition_name: e.edition_name,
              year: e.year,
              model_name: e.model_name,
              make_name: e.make_name
            }))
          );
        }

        setOnlyDiff(!!sel.only_differences);
        setLanguage(sel.language || "bg");
        setSnapshot(!!sel.is_snapshot);
      } catch (e) {
        console.error("Автоматичното попълване на селекцията е неуспешно", e);
      }
    })();
  }, [isEdit, initial?.compare_id]);

  const addEdition = (e) => {
    const val = e.target.value;
    if (!val) return;

    if (val === "__ALL__") {
      // Add all editions from the loaded list, deduped
      const existing = new Set(selected.map(s => s.edition_id));
      const toAdd = (listEditions || [])
        .filter(ed => !existing.has(ed.edition_id))
        .map(ed => ({
          edition_id: ed.edition_id,
          edition_name: ed.name,
          year: ed.year,
          model_name: ed.model_name || "",
          make_name: ed.make_name || ""
        }));

      if (toAdd.length > 0) {
        setSelected(prev => [...prev, ...toAdd]);
      }

      // reset pickers like your original flow
      setMakeId(""); setModelId(""); setYearId(""); setListEditions([]);
      return;
    }

    // Single edition add (original behavior)
    const id = Number(val);
    if (!id) return;
    const exists = selected.some(x => x.edition_id === id);
    if (exists) return;
    const meta = listEditions.find(x => x.edition_id === id);
    if (!meta) return;

    setSelected(prev => [
      ...prev,
      {
        edition_id: meta.edition_id,
        edition_name: meta.name,
        year: meta.year,
        model_name: meta.model_name || "",
        make_name: meta.make_name || ""
      }
    ]);

    // reset pickers
    setMakeId(""); setModelId(""); setYearId(""); setListEditions([]);
  };

  const removeEdition = (id) => {
    setSelected(prev => prev.filter(x => x.edition_id !== id));
  };

  const save = async () => {
    if (!title.trim()) return alert("Заглавието е задължително");
    if (selected.length === 0) return alert("Изберете поне едно издание");

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      only_differences: onlyDiff ? 1 : 0,
      language,
      snapshot: snapshot ? 1 : 0,
      edition_ids: selected.map(x => x.edition_id),
    };

    try {
      if (isEdit) {
        await api(`/compares/${initial.compare_id}`, { method: "PUT", body });
      } else {
        await api(`/compares`, { method: "POST", body });
      }
      onSaved?.();
    } catch (e) {
      console.error(e);
      alert(e.message || "Save failed");
    }
  };

  return (
    <div className="cmp-form">
      <div className="cmp-grid">
        <div className="cmp-field cmp-col-2">
          <label>Заглавие *</label>
          <input className="input" value={title} onChange={(e)=>setTitle(e.target.value)} />
        </div>

        <div className="cmp-field">
          <label>Език</label>
          <select className="select" value={language} onChange={e=>setLanguage(e.target.value)}>
            <option value="bg">BG</option>
            <option value="en">EN</option>
          </select>
        </div>

        <div className="cmp-field">
          <label>Покажи само разликите</label>
          <label className="cmp-check">
            <input type="checkbox" checked={onlyDiff} onChange={()=>setOnlyDiff(v=>!v)} />
            <span>Покажи само различаващите се атрикули</span>
          </label>
        </div>

        <div className="cmp-field cmp-col-2">
          <label>Описание</label>
          <textarea className="input" rows={2} value={description} onChange={e=>setDescription(e.target.value)} />
        </div>

        <div className="cmp-field">
          <label>Snapshot</label>
          <label className="cmp-check">
            <input type="checkbox" checked={snapshot} onChange={()=>setSnapshot(v=>!v)} />
            <span>Замрази данните в сравнението</span>
          </label>
        </div>
      </div>

      <fieldset className="cmp-fieldset">
        <legend>Добави издания</legend>

        <div className="cmp-grid">
          <div className="cmp-field">
            <label>Марка</label>
            <select className="select" value={makeId} onChange={(e)=>setMakeId(e.target.value)}>
              <option value="">Изберете марка…</option>
              {makes.map(m => <option key={m.make_id} value={m.make_id}>{m.name}</option>)}
            </select>
          </div>

          <div className="cmp-field">
            <label>Модел</label>
            <select className="select" value={modelId} onChange={(e)=>setModelId(e.target.value)} disabled={!makeId}>
              <option value="">Изберете модел…</option>
              {models.map(m => <option key={m.model_id} value={m.model_id}>{m.name}</option>)}
            </select>
          </div>

          <div className="cmp-field">
            <label>Година</label>
            <select className="select" value={yearId} onChange={(e)=>setYearId(e.target.value)} disabled={!modelId}>
              <option value="">Изберете година…</option>
              {years.map(y => <option key={y.model_year_id} value={y.model_year_id}>{y.year}</option>)}
            </select>
          </div>

          <div className="cmp-field">
            <label>Издание</label>
            <select className="select" onChange={addEdition} disabled={!yearId}>
              <option value="">Добави издание…</option>
              {/* “All” option appears when we have editions for the chosen year */}
              {listEditions.length > 0 && (
                <option value="__ALL__">Всички</option>
              )}
              {listEditions.map(ed => (
                <option key={ed.edition_id} value={ed.edition_id}>
                  {ed.name} ({ed.year})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="cmp-basket">
          {selected.length === 0 && <div className="text-muted">Все още няма избрани издания.</div>}
          {selected.map(e => (
            <div key={e.edition_id} className="cmp-chip">
              <span>
                {e.make_name ? `${e.make_name} ` : ""}
                {e.model_name ? `${e.model_name} ` : ""}
                {e.year} — {e.edition_name}
              </span>
              <button type="button" className="cmp-chip-x" onClick={() => removeEdition(e.edition_id)} title="Премахни">×</button>
            </div>
          ))}
        </div>
      </fieldset>

      <div className="btn-row" style={{ justifyContent: 'flex-end' }}>
        <button className="btn btn-primary" type="button" onClick={save}>
          {isEdit ? "Запази промените" : "Създай сравнение"}
        </button>
      </div>
    </div>
  );
}
