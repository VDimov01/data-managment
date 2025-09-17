import { useEffect, useState } from "react";

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
  const [years, setYears]   = useState([]);
  const [listEditions, setListEditions] = useState([]);

  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [yearId, setYearId] = useState("");

  // basket of selected editions (array of {edition_id, name, year, model_name, make_name})
  const [selected, setSelected] = useState([]);

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
    setModels([]); setModelId(""); setYears([]); setYearId(""); setListEditions([]);
    if (!makeId) return;
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/models?make_id=${makeId}`);
      setModels(await r.json());
    })().catch(console.error);
  }, [makeId, apiBase]);

  // load years by model
  useEffect(() => {
    setYears([]); setYearId(""); setListEditions([]);
    if (!modelId) return;
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/model-years?model_id=${modelId}`);
      setYears(await r.json());
    })().catch(console.error);
  }, [modelId, apiBase]);

  // load editions by year
  useEffect(() => {
    setListEditions([]);
    if (!yearId) return;
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/editions?model_year_id=${yearId}`);
      setListEditions(await r.json());
    })().catch(console.error);
  }, [yearId, apiBase]);

  // prefill when editing: fetch selection (edition_ids) & resolve edition meta
  useEffect(() => {
    if (!isEdit) return;
    (async () => {
      try {
        const r = await fetch(`${apiBase}/api/compares/${initial.compare_id}/selection`);
        if (!r.ok) return;
        const sel = await r.json();

        // load edition metadata via editions/compare (returns editions list)
        if (Array.isArray(sel.edition_ids) && sel.edition_ids.length > 0) {
          const rr = await fetch(`${apiBase}/api/editions/compare`, {
            method: "POST",
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ edition_ids: sel.edition_ids, only_differences: 0 })
          });
          const cmp = await rr.json();
          const eds = cmp?.editions || [];
          // normalize to basket format
          setSelected(eds.map(e => ({
            edition_id: e.edition_id,
            edition_name: e.edition_name,
            year: e.year,
            model_name: e.model_name,
            make_name: e.make_name
          })));
        }

        setOnlyDiff(!!sel.only_differences);
        setLanguage(sel.language || "bg");
        setSnapshot(!!sel.is_snapshot);
      } catch (e) {
        console.error("prefill compare selection failed", e);
      }
    })();
  }, [isEdit, initial, apiBase]);

  const addEdition = (e) => {
    const id = Number(e.target.value);
    if (!id) return;
    const exists = selected.some(x => x.edition_id === id);
    if (exists) return;
    const meta = listEditions.find(x => x.edition_id === id);
    if (!meta) return;
    setSelected(prev => [...prev, {
      edition_id: meta.edition_id,
      edition_name: meta.name,
      year: meta.year,
      model_name: meta.model_name || "", // optional if your cascade returns it
      make_name: meta.make_name || ""
    }]);
    // reset pickers to allow adding same edition again if needed
    setMakeId(""); setModelId(""); setYearId(""); setListEditions([]);
  };

  const removeEdition = (id) => {
    setSelected(prev => prev.filter(x => x.edition_id !== id));
  };

  const save = async () => {
    if (!title.trim()) return alert("Title is required");
    if (selected.length === 0) return alert("Select at least one edition");

    const body = {
      title: title.trim(),
      description: description.trim() || null,
      only_differences: onlyDiff ? 1 : 0,
      language,
      snapshot: snapshot ? 1 : 0,
      edition_ids: selected.map(x => x.edition_id)
    };

    try {
      let r;
      if (isEdit) {
        r = await fetch(`${apiBase}/api/compares/${initial.compare_id}`, {
          method: "PUT",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify(body)
        });
      } else {
        r = await fetch(`${apiBase}/api/compares`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify(body)
        });
      }
      const data = await r.json().catch(()=>null);
      if (!r.ok) {
        console.error(data);
        return alert(data?.error || "Save failed");
      }
      onSaved?.();
    } catch (e) {
      console.error(e); alert("Save failed");
    }
  };

  return (
    <div className="cmp-form">
      <div className="cmp-grid">
  <div className="cmp-field cmp-col-2">
    <label>Title *</label>
    <input value={title} onChange={(e)=>setTitle(e.target.value)} />
  </div>

  <div className="cmp-field">
    <label>Language</label>
    <select value={language} onChange={e=>setLanguage(e.target.value)}>
      <option value="bg">BG</option>
      <option value="en">EN</option>
    </select>
  </div>

  <div className="cmp-field">
    <label>Only differences</label>
    <div className="cmp-check">
      <input type="checkbox" checked={onlyDiff} onChange={()=>setOnlyDiff(v=>!v)} />
      <span>Show only differing attributes</span>
    </div>
  </div>

  <div className="cmp-field cmp-col-2">
    <label>Description</label>
    <textarea rows={2} value={description} onChange={e=>setDescription(e.target.value)} />
  </div>

  <div className="cmp-field">
    <label>Snapshot</label>
    <div className="cmp-check">
      <input type="checkbox" checked={snapshot} onChange={()=>setSnapshot(v=>!v)} />
      <span>Freeze data in compare</span>
    </div>
  </div>
</div>

      <fieldset className="cmp-fieldset">
  <legend>Add editions</legend>

  <div className="cmp-grid">
    <div className="cmp-field">
      <label>Make</label>
      <select value={makeId} onChange={(e)=>setMakeId(e.target.value)}>
        <option value="">Select make…</option>
        {makes.map(m => <option key={m.make_id} value={m.make_id}>{m.name}</option>)}
      </select>
    </div>

    <div className="cmp-field">
      <label>Model</label>
      <select value={modelId} onChange={(e)=>setModelId(e.target.value)} disabled={!makeId}>
        <option value="">Select model…</option>
        {models.map(m => <option key={m.model_id} value={m.model_id}>{m.name}</option>)}
      </select>
    </div>

    <div className="cmp-field">
      <label>Year</label>
      <select value={yearId} onChange={(e)=>setYearId(e.target.value)} disabled={!modelId}>
        <option value="">Select year…</option>
        {years.map(y => <option key={y.model_year_id} value={y.model_year_id}>{y.year}</option>)}
      </select>
    </div>

    <div className="cmp-field">
      <label>Edition</label>
      <select onChange={addEdition} disabled={!yearId}>
        <option value="">Add an edition…</option>
        {listEditions.map(ed => (
          <option key={ed.edition_id} value={ed.edition_id}>
            {ed.name} ({ed.year})
          </option>
        ))}
      </select>
    </div>
  </div>

  <div className="cmp-basket">
    {selected.length === 0 && <div className="cmp-muted">No editions selected yet.</div>}
    {selected.map(e => (
      <div key={e.edition_id} className="cmp-chip">
        <span>{e.make_name ? `${e.make_name} ` : ""}{e.model_name ? `${e.model_name} ` : ""}{e.year} — {e.edition_name}</span>
        <button type="button" onClick={() => removeEdition(e.edition_id)} title="Remove">×</button>
      </div>
    ))}
  </div>
</fieldset>

      <div className="cmp-actions-end">
        <button className="cmp-primary" onClick={save}>{isEdit ? "Save Changes" : "Create Compare"}</button>
      </div>
    </div>
  );
}
