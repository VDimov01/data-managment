// EditionAttributeModal.jsx
import { useEffect, useMemo, useState } from "react";
import EditionImageUploader from "./CarImageUploader";

// Canonical enum options (temporary; later fetch via /api/enums)
const ENUM_OPTIONS = {
  DRIVE_TYPE: [
    { value: '',                label: '(unset)' },
    { value: 'FWD',             label: 'FWD (Front-wheel drive)' },
    { value: 'RWD',             label: 'RWD (Rear-wheel drive)' },
    { value: 'AWD_ON_DEMAND',   label: 'AWD (on-demand)' },
    { value: 'AWD_FULLTIME',    label: 'AWD (full-time / 4WD)' },
  ]
};



// Only these are saved in EAV (numeric/boolean); the rest go to JSON.
// (You can tweak this set anytime without touching backend.)
const FILTERABLE_CODES = new Set([
  // Dimensions / chassis
  'LENGTH','WIDTH','HEIGHT','WHEELBASE','FRONT_TRACK_WIDTH','REAR_TRACK_WIDTH',
  // Power/torque
  'EV_MAX_POWER_KW','EV_MAX_POWER_HP','EV_MAX_TORQUE',
  'ICE_MAX_POWER_KW','ICE_MAX_POWER_HP','ICE_MAX_TORQUE',
  'ICE_MAX_POWER_RPM','ICE_MAX_TORQUE_RPM',
  // Performance / range / efficiency
  'MAX_SPEED','ACCELERATION_0_100','ELECTRIC_RANGE_CLTC',
  'ELECTRIC_RANGE_WLTC','MIXED_RANGE_MIIT_KM',
  'ELECTRICITY_CONSUMPTION_KWH_PER_100KM','WLTC_FUEL_CONSUMPTION',
  // Battery / charging (pick the ones you truly want filterable)
  'BATTERY_CAPACITY','FAST_CHARGE_TIME_H','SLOW_CHARGE_TIME_H',
  'FAST_CHARGE_MAX_POWER','SLOW_CHARGER_POWER',
  // Seats / weights
  'SEATS_COUNT','CURB_WEIGHT_KG','GROSS_VEHICLE_WEIGHT','MAXIMUM_MASS','MAX_PAYLOAD',
]);

// normalize a UI value (string from <input>) to typed value or null
function coerceByType(dt, v) {
  if (v === '' || v == null) return null;
  if (dt === 'boolean') {
    if (v === true || v === 'true' || v === 1 || v === '1')  return 1;
    if (v === false || v === 'false' || v === 0 || v === '0') return 0;
    return null;
  }
  if (dt === 'int') {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const z = Math.trunc(n);
    return z === 0 ? null : z;
  }
  if (dt === 'decimal') {
    const x = Number(v);
    if (!Number.isFinite(x)) return null;
    return Math.abs(x) < 1e-9 ? null : x;
  }
  // text
  const s = String(v).trim();
  return s ? s : null;
}

// map user input like "front wheel drive" -> "FWD"
function normalizeDriveType(input) {
  if (!input) return '';
  const r = String(input).trim().toLowerCase();

  if (['fwd','предно','front','front wheel drive'].includes(r)) return 'FWD';
  if (['rwd','задно','rear','rear wheel drive'].includes(r))   return 'RWD';
  if (['awd','awd (on-demand)','awd (при нужда)'].includes(r))  return 'AWD_ON_DEMAND';
  if (['4wd','4x4','awd (full-time)','awd (постоянно)'].includes(r)) return 'AWD_FULLTIME';

  // already canonical?
  const up = r.toUpperCase();
  return ['FWD','RWD','AWD_ON_DEMAND','AWD_FULLTIME'].includes(up) ? up : '';
}



export default function EditionAttributeModal({ apiBase = "http://localhost:5000", onSaved, edition = null, onCreated, onUpdated }) {
  // mode: 'select' (existing) or 'create' (new)
  const [mode, setMode] = useState('create');
  const [view, setView] = useState('attributes'); // 'attributes' | 'images'

  // --- SELECT MODE state ---
  const [makeId, setMakeId] = useState("");
  const [modelId, setModelId] = useState("");
  const [modelYearId, setModelYearId] = useState("");
  const [editionId, setEditionId] = useState("");

  // dropdown data for SELECT MODE
  const [makes, setMakes] = useState([]);
  const [models, setModels] = useState([]);
  const [years, setYears] = useState([]);
  const [editions, setEditions] = useState([]);

  // --- CREATE MODE state: select-or-create per level ---
  const [makeSel, setMakeSel] = useState({ mode: 'existing', value: '', newValue: '' });
  const [modelSel, setModelSel] = useState({ mode: 'existing', value: '', newValue: '' });
  const [yearSel,  setYearSel]  = useState({ mode: 'existing', value: '', newValue: '' });
  const [edSel,    setEdSel]    = useState({ mode: 'new',      value: '', newValue: '' }); // default new edition

  
  const isCreating  = mode === 'create';
  const hasEdition  = !!editionId;
  const showEditor  = !isCreating && hasEdition;   // only show editor when NOT creating and an edition is selected
  const showToolbar = !isCreating;                 // toolbar (filter/source) only when not creating


  // dropdown data for CREATE MODE
  const [cModels, setCModels] = useState([]);
  const [cYears, setCYears]   = useState([]);
  const [cEds, setCEds]       = useState([]);

  // attributes
  const [rows, setRows] = useState([]);
  const [langBg, setLangBg] = useState(true);
  const [filter, setFilter] = useState("");

  const [srcFilter, setSrcFilter] = useState("ALL"); // ALL | OVERRIDDEN | INHERITED | UNSET
  const [notices, setNotices] = useState([]);        // messages returned after save (optional)

  // enum (DRIVE_TYPE)
  const [driveType, setDriveType] = useState('');


const passSourceFilter = (row) => {
  if (srcFilter === "ALL") return true;
  if (srcFilter === "OVERRIDDEN") return row.source === "edition";
  if (srcFilter === "INHERITED")  return row.source === "model" || row.source === "model_year";
  if (srcFilter === "UNSET")      return !row.source;
  return true;
};


useEffect(() => {
  if (!edition) return;

  let cancelled = false;

  (async () => {
    try {
      setMode('select'); // open in Select mode

      // 1) MAKES
      const makesData = await fetch(`${apiBase}/api/cascade/makes`).then(r => r.json());
      if (cancelled) return;
      setMakes(makesData);

      const makeMatch = makesData.find(m =>
        (edition.make_id && m.make_id === Number(edition.make_id)) ||
        (edition.make && m.name?.toLowerCase() === String(edition.make).trim().toLowerCase())
      );
      if (!makeMatch) return; // bail if no match
      setMakeId(String(makeMatch.make_id));

      // 2) MODELS (for that make)
      const modelsData = await fetch(`${apiBase}/api/cascade/models?make_id=${makeMatch.make_id}`).then(r => r.json());
      if (cancelled) return;
      setModels(modelsData);

      const modelMatch = modelsData.find(m =>
        (edition.model_id && m.model_id === Number(edition.model_id)) ||
        (edition.model && m.name?.toLowerCase() === String(edition.model).trim().toLowerCase())
      );
      if (!modelMatch) return;
      setModelId(String(modelMatch.model_id));

      // 3) YEARS (for that model)
      const yearsData = await fetch(`${apiBase}/api/cascade/model-years?model_id=${modelMatch.model_id}`).then(r => r.json());
      if (cancelled) return;
      setYears(yearsData);

      const yearNum = Number(edition.year);
      const yearMatch = yearsData.find(y =>
        (edition.model_year_id && y.model_year_id === Number(edition.model_year_id)) ||
        (Number.isFinite(yearNum) && y.year === yearNum)
      );
      if (!yearMatch) return;
      setModelYearId(String(yearMatch.model_year_id));

      // 4) EDITIONS (for that year)
      const edsData = await fetch(`${apiBase}/api/cascade/editions?model_year_id=${yearMatch.model_year_id}`).then(r => r.json());
      if (cancelled) return;
      setEditions(edsData);

      const edName = edition.edition_name || edition.name;
      const edMatch = edsData.find(e =>
        (edition.edition_id && e.edition_id === Number(edition.edition_id)) ||
        (edName && e.name?.toLowerCase() === String(edName).trim().toLowerCase())
      );
      if (!edMatch) return;
      setEditionId(String(edMatch.edition_id)); // <-- your existing effect will load its attributes
    } catch (e) {
      console.error('Prefill from edition failed:', e);
    }
  })();

  return () => { cancelled = true; };
}, [edition, apiBase]);



  // ---------- Shared loaders (SELECT MODE) ----------
  const loadMakes = async () => {
    const r = await fetch(`${apiBase}/api/cascade/makes`);
    setMakes(await r.json());
  };
  useEffect(() => { loadMakes().catch(console.error); }, [apiBase]);

  const loadModels = async (mkId) => {
    const r = await fetch(`${apiBase}/api/cascade/models?make_id=${mkId}`);
    setModels(await r.json());
  };
  useEffect(() => {
    setModelId(""); setModelYearId(""); setEditionId("");
    setModels([]); setYears([]); setEditions([]); setRows([]);
    if (makeId) loadModels(makeId).catch(console.error);
  }, [makeId]);

  const loadYears = async (mdId) => {
    const r = await fetch(`${apiBase}/api/cascade/model-years?model_id=${mdId}`);
    setYears(await r.json());
  };
  useEffect(() => {
    setModelYearId(""); setEditionId("");
    setYears([]); setEditions([]); setRows([]);
    if (modelId) loadYears(modelId).catch(console.error);
  }, [modelId]);

  const loadEditions = async (myId) => {
    const r = await fetch(`${apiBase}/api/cascade/editions?model_year_id=${myId}`);
    setEditions(await r.json());
  };
  useEffect(() => {
    setEditionId(""); setEditions([]); setRows([]);
    if (modelYearId) loadEditions(modelYearId).catch(console.error);
  }, [modelYearId]);



// attributes for selected edition (merge EFFECTIVE + SPECS, incl. JSON for ALL types)
const loadEditionAttributes = async (edId) => {
  // 1) attribute defs + effective values (edition/year/model)
  const defs = await fetch(`${apiBase}/api/editions/${edId}/attributes?effective=1&lang=bg`).then(r => r.json());

  // 2) JSON/EAV sidecar
  const specs = await fetch(`${apiBase}/api/editions/${edId}/specs?lang=bg`).then(r => r.json());
  const eavNum  = new Map((specs?.eav?.numeric  || []).map(row => [row.code, row.val]));
  const eavBool = new Map((specs?.eav?.boolean || []).map(row => [row.code, row.val ? 1 : 0]));
  const jsonAttrs = specs?.json?.attributes || {};
  const jsonBG    = specs?.json_i18n?.bg?.attributes || {};
  const enums     = specs?.enums || {};
  console.log('Loaded specs', { eavNum, eavBool, jsonAttrs, jsonBG, enums });

  // enum (Drive)
  if (typeof setDriveType === 'function') setDriveType(enums.DRIVE_TYPE || '');

  // helpers to read JSON sidecar for any dt
  const jsonHas = (code, dt) => {
    const o = jsonAttrs[code];
    return o && (o.dt === dt || (!o.dt && dt === 'text')); // tolerate missing dt for text
  };
  const jsonVal = (code) => jsonAttrs[code]?.v;

  const rows = defs.map(a => {
    let value = '';

    if (a.data_type === 'boolean') {
      // prefer effective/EAV, then JSON boolean
      const ev = (a.value_boolean != null ? a.value_boolean
                : eavBool.has(a.code) ? eavBool.get(a.code)
                : jsonHas(a.code, 'boolean') ? (jsonVal(a.code) ? 1 : 0)
                : null);
      value = ev == null ? '' : (ev ? 'true' : 'false');

    } else if (a.data_type === 'int' || a.data_type === 'decimal') {
      // prefer effective/EAV, then JSON int/decimal
      const ev = (a.value_numeric != null ? a.value_numeric
                : eavNum.has(a.code) ? eavNum.get(a.code)
                : (jsonHas(a.code, a.data_type) ? Number(jsonVal(a.code)) : null));
      value = ev == null ? '' : ev;

    } else if (a.data_type === 'enum') {
   // Prefer code (what we’ll send back), fall back to label
      value = (a.enum_code || '').toUpperCase() || (a.enum_label || '');
    } else {
      // TEXT: prefer BG i18n JSON > JSON raw > effective text
      const fromJson = (jsonBG[a.code] ?? (jsonHas(a.code, 'text') ? String(jsonVal(a.code)) : null));
      value = fromJson != null ? fromJson : (a.value_text ?? '');
    }

    return {
      ...a,
      source: a.source ?? null,
      annotation: a.annotation ?? "",
      value,
      removed: false
    };
  });

  setRows(rows);

  // Optional: quick sanity log
  console.debug('[loadEditionAttributes]', {
    defs: defs.length,
    eavNum: eavNum.size, eavBool: eavBool.size,
    jsonAttrs: Object.keys(jsonAttrs).length,
    jsonBG: Object.keys(jsonBG).length,
    enumDrive: enums.DRIVE_TYPE || '(none)'
  });
};





  useEffect(() => {
    setRows([]);
    if (editionId) loadEditionAttributes(editionId).catch(console.error);
  }, [editionId]);

  // ---------- CREATE MODE loaders (independent of SELECT MODE) ----------
  // When makeSel picks existing, load models for that make (create panel)
  useEffect(() => {
    setModelSel(s => ({ ...s, value:'', newValue:'', mode:'existing' }));
    setYearSel(s  => ({ ...s, value:'', newValue:'', mode:'existing' }));
    setEdSel(s    => ({ ...s, value:'', newValue:'', mode:'new' }));
    setCModels([]); setCYears([]); setCEds([]);

    if (makeSel.mode !== 'existing' || !makeSel.value) return;
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/models?make_id=${makeSel.value}`);
      setCModels(await r.json());
    })().catch(console.error);
  }, [makeSel.mode, makeSel.value, apiBase]);

  // When modelSel picks existing, load years for that model (create panel)
  useEffect(() => {
    setYearSel(s => ({ ...s, value:'', newValue:'', mode:'existing' }));
    setEdSel(s   => ({ ...s, value:'', newValue:'', mode:'new' }));
    setCYears([]); setCEds([]);

    if (modelSel.mode !== 'existing' || !modelSel.value) return;
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/model-years?model_id=${modelSel.value}`);
      setCYears(await r.json());
    })().catch(console.error);
  }, [modelSel.mode, modelSel.value, apiBase]);

  // When yearSel picks existing, load editions for that model_year (create panel)
  useEffect(() => {
    setEdSel(s => ({ ...s, value:'', newValue:'', mode:'new' }));
    setCEds([]);

    if (yearSel.mode !== 'existing' || !yearSel.value) return;
    (async () => {
      const r = await fetch(`${apiBase}/api/cascade/editions?model_year_id=${yearSel.value}`);
      setCEds(await r.json());
    })().catch(console.error);
  }, [yearSel.mode, yearSel.value, apiBase]);

  // ---------- CREATE & SELECT handler ----------
  const onCreateAndSelect = async () => {
    // If user chose an existing edition in the create panel, just jump to it
    if (edSel.mode === 'existing' && edSel.value) {
      // Mirror selections into SELECT MODE and switch
      if (makeSel.mode === 'existing') setMakeId(String(makeSel.value));
      if (modelSel.mode === 'existing') setModelId(String(modelSel.value));
      if (yearSel.mode  === 'existing') setModelYearId(String(yearSel.value));
      setEditionId(String(edSel.value));
      setMode('select');
      return;
    }

    // Resolve names/numbers to POST
    const makeName =
      makeSel.mode === 'new'
        ? (makeSel.newValue || '').trim()
        : (makes.find(m => String(m.make_id) === String(makeSel.value))?.name || '');

    const modelName =
      modelSel.mode === 'new'
        ? (modelSel.newValue || '').trim()
        : (cModels.find(m => String(m.model_id) === String(modelSel.value))?.name || '');

    const yearNumber =
      yearSel.mode === 'new'
        ? Number(String(yearSel.newValue || '').trim())
        : (cYears.find(y => String(y.model_year_id) === String(yearSel.value))?.year);

    const editionName = (edSel.newValue || '').trim();

    if (!makeName || !modelName || !yearNumber || !editionName) {
      alert("Please provide Make, Model, Year, and a NEW Edition name.");
      return;
    }

    // Create edition
    const r = await fetch(`${apiBase}/api/editions`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ make: makeName, model: modelName, year: yearNumber, editionName })
    });
    const data = await r.json();

    if(r.ok && data.edition_id && typeof onCreated === "function") {
      onCreated?.(data);
    }

    if (!r.ok && r.status === 409 && data.edition_id) {
      // Edition exists -> switch to it
      if (makeSel.mode === 'existing') setMakeId(String(makeSel.value));
      if (modelSel.mode === 'existing') setModelId(String(modelSel.value));
      if (yearSel.mode  === 'existing') setModelYearId(String(yearSel.value));
      setEditionId(String(data.edition_id));
      setMode('select');
      onCreated?.(data);
      return;
    } else if (!r.ok) {
      console.error(data);
      alert(data.error || "Failed to create edition");
      return;
    }

    // Refresh SELECT MODE cascade and pick newly created IDs
    await loadMakes();
    setMakeId(String(data.make_id));
    await loadModels(data.make_id);
    setModelId(String(data.model_id));
    await loadYears(data.model_id);
    setModelYearId(String(data.model_year_id));
    await loadEditions(data.model_year_id);
    setEditionId(String(data.edition_id));
    setMode('select');
  };

  // ---------- Attributes grouping ----------
  const grouped = useMemo(() => {
    const m = new Map();
    rows.forEach(r => {
      const cat = r.category || "Other";
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat).push(r);
    });
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b));
  }, [rows]);

  const matchesFilter = (r) => {
    if (!filter.trim()) return true;
    const q = filter.trim().toLowerCase();
    return (r.name || "").toLowerCase().includes(q)
        || (r.name_bg || "").toLowerCase().includes(q)
        || (r.code || "").toLowerCase().includes(q)
        || (r.category || "").toLowerCase().includes(q);
  };

  // Save attributes (drops null/empty/zero as per your rule)
  // Save JSON + EAV (to /api/editions/:id/specs)
const submitSpecs = async (e) => {
  e.preventDefault();
  if (!editionId) return alert("Choose or create an edition first.");

  // 1) Gather current, non-removed rows with non-null values
  const active = rows
    .filter(r => !r.removed)
    .map(r => {
      const val = coerceByType(r.data_type, r.value);
      return { ...r, val };
    })
    .filter(r => r.val !== null);

  // 2) Split into EAV vs JSON
  const eavNumeric = [];
  const eavBoolean = [];
  const json = { attributes: {} };
  const json_i18n = { bg: { attributes: {} } }; // default language is BG
  const enumValues = {};

  for (const r of active) {
     // 1) handle enums (do NOT drop them into JSON)
    if (r.data_type === 'enum') {
    if (r.code === 'DRIVE_TYPE') {
      enumValues.DRIVE_TYPE = normalizeDriveType(r.val); // already canonical? this keeps it canonical
    }
    continue; // skip JSON/EAV for enums
  }
    const isFilterable = FILTERABLE_CODES.has(r.code);
    if ((r.data_type === 'int' || r.data_type === 'decimal') && isFilterable) {
      eavNumeric.push({ code: r.code, val: r.val });
      continue;
    }
    if (r.data_type === 'boolean' && isFilterable) {
      eavBoolean.push({ code: r.code, val: !!r.val });
      continue;
    }

    // Everything else goes to JSON sidecar (store typed value + metadata)
    json.attributes[r.code] = { v: r.val, dt: r.data_type, u: r.unit || null };

    // If it's text, keep BG i18n copy as well (EN optional, handled later elsewhere)
    if (r.data_type === 'text') {
      json_i18n.bg.attributes[r.code] = String(r.val);
    }
  }

  // 3) Enum: DRIVE_TYPE (from the little dropdown)
  const enums = {};
  if (enumValues.DRIVE_TYPE) enums.DRIVE_TYPE = enumValues.DRIVE_TYPE;

  // 4) POST
  const payload = {
    enums,
    eavNumeric,
    eavBoolean,
    eavText: [],         // we’re storing text in JSON for now
    json,
    json_i18n            // BG only for now (EN can be added later)
  };

  const r = await fetch(`${apiBase}/api/editions/${editionId}/specs`, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  });
  const data = await r.json();

  if (!r.ok) {
    console.error(data);
    return alert(data.error || "Failed to save specs");
  }

  setNotices([`Saved JSON+EAV successfully (${eavNumeric.length} numeric, ${eavBoolean.length} boolean, ${Object.keys(json.attributes).length} JSON).`]);
  alert("Saved.");
  if (typeof onSaved === "function") onSaved({ editionId });
};


  // derive current selection names/values (safe & memoized)
const selectedMakeName = useMemo(
  () => makes.find(m => String(m.make_id) === String(makeId))?.name || "",
  [makes, makeId]
);

const selectedModelName = useMemo(
  () => models.find(m => String(m.model_id) === String(modelId))?.name || "",
  [models, modelId]
);

const selectedYearObj = useMemo(
  () => years.find(y => String(y.model_year_id) === String(modelYearId)) || null,
  [years, modelYearId]
);
const selectedYear = selectedYearObj?.year || "";

const selectedEditionObj = useMemo(
  () => editions.find(e => String(e.edition_id) === String(editionId)) || null,
  [editions, editionId]
);
const selectedEditionName = selectedEditionObj?.name || "";


  return (
    <div>
      {/* Mode switch */}
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
        <button type="button" onClick={() => setMode('create')} disabled={mode==='create'}>Създай нов</button>
        <button type="button" onClick={() => setMode('select')} disabled={mode==='select'}>Избери съществуващ</button>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:12 }}>
  <button type="button" onClick={() => setView('attributes')} disabled={view==='attributes'}>
    Attributes
  </button>
  <button type="button" onClick={() => setView('images')} disabled={view==='images'}>
    Images
  </button>
</div>

      {isCreating ? (
        <div style={{ border:'1px solid #eee', borderRadius:8, padding:12, marginBottom:12 }}>
          <h4 style={{ marginTop:0 }}>Create new edition</h4>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
            {/* Make */}
            <SelectOrCreate
              label="Make"
              options={makes.map(m => ({ value:String(m.make_id), label:m.name }))}
              mode={makeSel.mode}
              setMode={(m)=>setMakeSel(s=>({ ...s, mode:m }))}
              value={makeSel.value}
              setValue={(v)=>setMakeSel(s=>({ ...s, value:v }))}
              newValue={makeSel.newValue}
              setNewValue={(v)=>setMakeSel(s=>({ ...s, newValue:v }))}
            />

            {/* Model (disabled if Make is new) */}
            <SelectOrCreate
              label="Model"
              // disabled={makeSel.mode === 'new'}
              options={cModels.map(m => ({ value:String(m.model_id), label:m.name }))}
              mode={modelSel.mode}
              setMode={(m)=>setModelSel(s=>({ ...s, mode:m }))}
              value={modelSel.value}
              setValue={(v)=>setModelSel(s=>({ ...s, value:v }))}
              newValue={modelSel.newValue}
              setNewValue={(v)=>setModelSel(s=>({ ...s, newValue:v }))}
            />

            {/* Year (disabled if Model is new) */}
            <SelectOrCreate
              label="Year"
              // disabled={modelSel.mode === 'new'}
              options={cYears.map(y => ({ value:String(y.model_year_id), label:String(y.year) }))}
              mode={yearSel.mode}
              setMode={(m)=>setYearSel(s=>({ ...s, mode:m }))}
              value={yearSel.value}
              setValue={(v)=>setYearSel(s=>({ ...s, value:v }))}
              newValue={yearSel.newValue}
              setNewValue={(v)=>setYearSel(s=>({ ...s, newValue:v }))}
              inputType="number"
              inputPlaceholder="e.g. 2025"
            />

            {/* Edition (existing OR create new) – disabled if Year is new */}
            <SelectOrCreate
              label="Edition"
              // disabled={yearSel.mode === 'new'}
              options={cEds.map(e => ({ value:String(e.edition_id), label:e.name }))}
              mode={edSel.mode}
              setMode={(m)=>setEdSel(s=>({ ...s, mode:m }))}
              value={edSel.value}
              setValue={(v)=>setEdSel(s=>({ ...s, value:v }))}
              newValue={edSel.newValue}
              setNewValue={(v)=>setEdSel(s=>({ ...s, newValue:v }))}
            />
          </div>

          <div style={{ marginTop:12 }}>
            <button type="button" onClick={onCreateAndSelect}>Create & Select</button>
          </div>
        </div>
      ) : (
        // Select existing cascade
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 10, marginBottom: 12 }}>
          <select value={makeId} onChange={e => setMakeId(e.target.value)}>
            <option value="">Maker…</option>
            {makes.map(m => <option key={m.make_id} value={m.make_id}>{m.name}</option>)}
          </select>

          <select value={modelId} onChange={e => setModelId(e.target.value)} disabled={!makeId}>
            <option value="">Model…</option>
            {models.map(mo => <option key={mo.model_id} value={mo.model_id}>{mo.name}</option>)}
          </select>

          <select value={modelYearId} onChange={e => setModelYearId(e.target.value)} disabled={!modelId}>
            <option value="">Year…</option>
            {years.map(y => <option key={y.model_year_id} value={y.model_year_id}>{y.year}</option>)}
          </select>

          <select value={editionId} onChange={e => setEditionId(e.target.value)} disabled={!modelYearId}>
            <option value="">Edition…</option>
            {editions.map(ed => <option key={ed.edition_id} value={ed.edition_id}>{ed.name}</option>)}
          </select>
        </div>
      )}

      {/* Toolbar */}
      {showToolbar && (
      <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:10 }}>
        <input placeholder="Filter (name/code/category)…" value={filter} onChange={e => setFilter(e.target.value)} style={{ flex:1 }} />
        <label style={{ display:'flex', gap:6, alignItems:'center' }}>
          <input type="checkbox" checked={langBg} onChange={() => setLangBg(v=>!v)} /> BG labels
        </label>
        {/* 👇 NEW: Source filter */}
  <select
    value={srcFilter}
    onChange={e => setSrcFilter(e.target.value)}
    title="Filter by value source"
  >
    <option value="ALL">All sources</option>
    <option value="OVERRIDDEN">Overridden (edition)</option>
    <option value="INHERITED">Inherited (model / year)</option>
    <option value="UNSET">Unset (no value)</option>
  </select>
  
        <button type="button" onClick={() => setRows(prev => prev.map(r => ({ ...r, removed:false })))}>
          Restore removed
        </button>
      </div>
      )}

      {!isCreating && notices.length > 0 && (
  <div style={{
    margin:'8px 0 12px', padding:'8px 10px',
    background:'#f0fdf4', border:'1px solid #bbf7d0', borderRadius:8,
    fontSize:13, color:'#166534'
  }}>
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
      <strong>Save summary</strong>
      <button
        type="button"
        onClick={() => setNotices([])}
        style={{ border:'none', background:'transparent', cursor:'pointer', color:'#166534' }}
      >
        ×
      </button>
    </div>
    <ul style={{ margin:'6px 0 0 16px' }}>
      {notices.map((n, i) => <li key={i}>{n}</li>)}
    </ul>
  </div>
)}



{view === 'images' ? (
  // IMAGES TAB
  isCreating ? (
    <p>Create and select an edition first to manage images.</p>
  ) : !hasEdition ? (
    <p>Select an edition first to manage images.</p>
  ) : (
    <>
      <EditionImageUploader
        apiBase={apiBase}
        editionId={Number(editionId)}
        makeName={selectedMakeName}
        modelName={selectedModelName}
        modelYear={selectedYear}
        editionName={selectedEditionName}
      />
    </>
  )
) : (
  // ATTRIBUTES TAB
  isCreating ? (
    <p>Create and select an edition to edit attributes.</p>
  ) : !hasEdition ? (
    <p>Select an edition to edit attributes.</p>
  ) : (
    <form onSubmit={submitSpecs}>
      {grouped.map(([category, items]) => {
        const vis = items.filter(r => !r.removed && matchesFilter(r) && passSourceFilter(r));
        const rem = items.filter(r =>  r.removed && matchesFilter(r) && passSourceFilter(r));
        if (vis.length === 0 && rem.length === 0) return null;

        return (
          <fieldset key={category} style={{ border:'1px solid #eee', borderRadius:8, marginBottom:12 }}>
            <legend style={{ padding:'0 8px' }}>{category}</legend>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr auto', gap:8, padding:12 }}>
              <div style={{ fontWeight:600 }}></div>
              <div style={{ fontWeight:600 }}>Стойност</div>
              <div style={{ fontWeight:600 }}>Мерна единица</div>
              <div style={{ fontWeight:600 }}>Действия</div>

              {vis.map(r => (
                <Row
                  key={r.attribute_id || r.code}
                  r={r}
                  langBg={langBg}
                  enumOptions={ENUM_OPTIONS}
                  onChangeValue={(val) =>
                    setRows(prev =>
                      prev.map(x =>
                        (x.attribute_id || x.code) === (r.attribute_id || r.code)
                          ? { ...x, value: val }
                          : x
                      )
                    )
                  }
                  onRemove={() =>
                    setRows(prev =>
                      prev.map(x =>
                        (x.attribute_id || x.code) === (r.attribute_id || r.code)
                          ? { ...x, removed: true }
                          : x
                      )
                    )
                  }
                />
              ))}

              {rem.length > 0 && (
                <div style={{ gridColumn:'1 / -1', marginTop:6 }}>
                  <small>Removed here: </small>
                  {rem.map(r => (
                    <button
                      key={`rm-${r.attribute_id || r.code}`}
                      type="button"
                      onClick={() =>
                        setRows(prev =>
                          prev.map(x =>
                            (x.attribute_id || x.code) === (r.attribute_id || r.code)
                              ? { ...x, removed:false }
                              : x
                          )
                        )
                      }
                      style={{ marginRight:6 }}
                    >
                      ↩ {langBg ? (r.name_bg || r.name) : r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </fieldset>
        );
      })}

      <div style={{ marginTop:12 }}>
        <button type="submit">Save Attributes</button>
      </div>
    </form>
  )
)}

      
    </div>
  );
}

/* Helper: dropdown with a “Create new…” option that reveals an input */
function SelectOrCreate({
  label,
  options,
  mode, setMode,
  value, setValue,
  newValue, setNewValue,
  disabled = false,
  inputType = "text",
  inputPlaceholder = ""
}) {
  const NEW = "__new__";
  return (
    <div>
      <label style={{ display:'block', fontSize:12, color:'#666', marginBottom:4 }}>{label}</label>
      <select
        disabled={disabled}
        value={mode === 'existing' ? (value || '') : NEW}
        onChange={(e) => {
          if (e.target.value === NEW) {
            setMode('new');
            setValue('');
          } else {
            setMode('existing');
            setValue(e.target.value);
          }
        }}
        style={{ width:'100%' }}
      >
        <option value="">{label}…</option>
        {options?.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        <option value={NEW}>➕ Create new…</option>
      </select>

      {mode === 'new' && (
        <input
          type={inputType}
          placeholder={inputPlaceholder || `New ${label}`}
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          style={{ width:'100%', marginTop:6 }}
        />
      )}
    </div>
  );
}

const sourceLabel = (s) =>
  s === "edition" ? "Edition"
  : s === "model_year" ? "Year"
  : s === "model" ? "Model"
  : "Unset";

const sourceBadgeStyle = (s) => ({
  display: 'inline-block',
  fontSize: 11,
  borderRadius: 6,
  padding: '2px 6px',
  background:
    s === "edition" ? '#e6f2ff' :
    s === "model_year" ? '#f3e8ff' :
    s === "model" ? '#eef2f7' :
    '#f7f7f7',
  color:
    s === "edition" ? '#1556b0' :
    s === "model_year" ? '#6b21a8' :
    s === "model" ? '#334155' :
    '#6b7280',
  border: '1px solid #e5e7eb',
});

function Row({ r, langBg, enumOptions = {}, onChangeValue, onRemove }) {
  const [openInfo, setOpenInfo] = useState(false);
  const label = langBg ? (r.name_bg || r.name) : r.name;


  // a short, human explanation (purely cosmetic)
  const why =
    r.source === 'edition' ? 'This value is set specifically for this edition.'
  : r.source === 'model_year' ? 'This value is inherited from the model year.'
  : r.source === 'model' ? 'This value is inherited from the model.'
  : 'No value is set at any level.';

  return (
    <>
      {/* Attribute column */}
      <div title={r.code}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ fontWeight:500 }}>{label}</div>
          {/* 👇 provenance badge */}
          <span style={sourceBadgeStyle(r.source)}>{sourceLabel(r.source)}</span>

          {/* quick info toggle */}
          <button
            type="button"
            onClick={() => setOpenInfo(o => !o)}
            title="Why is this value here?"
            style={{ border:'none', background:'transparent', cursor:'pointer', fontSize:14, color:'#666' }}
          >
            ⓘ
          </button>
        </div>
        <div style={{ fontSize:12, color:'#666' }}>{r.code}</div>

        {/* optional annotation from backend */}
        {r.annotation ? (
          <div style={{ fontSize:12, color:'#0b6b3a', marginTop:4 }}>
            {r.annotation}
          </div>
        ) : null}

        {/* optional inline explainer */}
        {openInfo && (
          <div style={{
            fontSize:12, color:'#444', background:'#f9fafb', border:'1px solid #eee',
            padding:'6px 8px', borderRadius:6, marginTop:6
          }}>
            {why}
          </div>
        )}
      </div>

      {/* Value input */}
{r.data_type === 'boolean' ? (
  <select value={String(r.value ?? '')} onChange={e => onChangeValue(e.target.value)}>
    <option value="">(null)</option>
    <option value="true">true</option>
    <option value="false">false</option>
  </select>
) : r.data_type === 'enum' && Array.isArray(enumOptions[r.code]) ? (
  <select
    value={String(r.value ?? '')}
    onChange={e => onChangeValue(e.target.value)}
    title={r.code}
  >
    {enumOptions[r.code].map(opt => (
      <option key={opt.value} value={opt.value}>{opt.label}</option>
    ))}
  </select>
) : (
  <input
    type={r.data_type === 'text' ? 'text' : 'number'}
    step={r.data_type === 'decimal' ? '0.01' : undefined}
    placeholder={r.data_type === 'int' ? 'integer' : r.data_type === 'decimal' ? 'decimal' : 'text'}
    value={r.value}
    onChange={e => onChangeValue(e.target.value)}
  />
)}

      {/* Unit + actions */}
      <input disabled value={r.unit || ''} placeholder="unit" />
      <button type="button" onClick={onRemove}>Remove</button>
    </>
  );
}
