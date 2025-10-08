// VehicleCreateForm.jsx
import { useEffect, useMemo, useState } from "react";


const STATUSES = ['InTransit','Available','Reserved','Sold','Service','Demo'];

const status_to_bg = {
  InTransit: "В процес на доставка",
  Available: "Наличен",
  Reserved: "Резервиран",
  Sold: "Продаден",
  Service: "Сервиз",
  Demo: "Демо"
}

export default function VehicleCreateForm({
  apiBase = "http://localhost:5000",
  edition,              // used in create mode title
  vehicle = null,       // used in edit mode (full row with ids)
  mode = 'create',      // 'create' | 'edit'
  onCreated = () => {},
  onUpdated = () => {}, // 👈 new
  onClose = () => {},
}) {
  const [extColors, setExtColors] = useState([]);
  const [intColors, setIntColors] = useState([]);
  const [shops, setShops] = useState([]);

const [extMode, setExtMode] = useState('existing'); // 'existing' | 'new' | 'none'
const [extValue, setExtValue] = useState('');        // color_id when existing
const [extNew, setExtNew] = useState('');            // new color name

const [intMode, setIntMode] = useState('existing'); // interior is optional
const [intValue, setIntValue] = useState('');
const [intNew, setIntNew] = useState('');

// after you load extColors/intColors, you may want to reset modes/values if needed

  const [form, setForm] = useState({
    vin: '',
    release_date: '',
    exterior_color_id: '',
    interior_color_id: '',
    shop_id: '',
    status: 'InTransit',
    expected_arrival_earliest: '',
    expected_arrival_latest: '',
    useDefaultEta: true, // toggle: default 60–90 vs custom dates
    asking_price: '',
    mileage: '',
  });

  let title = '';
  title = useMemo(() =>
    `${edition?.make || ''} ${edition?.model || ''} ${edition?.year || ''} — ${edition?.edition_name || ''}`,
    [edition]
  );

  useEffect(() => {
    (async () => {
      const [ext, intl, shops] = await Promise.all([
        fetch(`${apiBase}/api/colors/exterior`).then(r => r.json()),
        fetch(`${apiBase}/api/colors/interior`).then(r => r.json()),
        fetch(`${apiBase}/api/shops/new`).then(r => r.json()),
      ]);
      setExtColors(ext || []);
      setIntColors(intl || []);
      setShops(shops || []);
    })().catch(console.error);
  }, [apiBase]);

  // Prefill in EDIT mode
  useEffect(() => {
    if (mode !== 'edit' || !vehicle) return;

    setForm({
      vin: vehicle.vin || '',
      release_date: vehicle.release_date || '',
      shop_id: vehicle.shop_id ? String(vehicle.shop_id) : '',
      status: vehicle.status || 'InTransit',
      asking_price: vehicle.asking_price != null ? String(vehicle.asking_price) : '',
      mileage: vehicle.mileage != null ? String(vehicle.mileage) : '',
    });

    if (vehicle.exterior_color_id) {
      setExtMode('existing');
      setExtValue(String(vehicle.exterior_color_id));
      setExtNew('');
    } else {
      setExtMode('existing'); // allow blank
      setExtValue('');
    }

    if (vehicle.interior_color_id) {
      setIntMode('existing');
      setIntValue(String(vehicle.interior_color_id));
      setIntNew('');
    } else {
      setIntMode('none');
      setIntValue('');
    }
  }, [mode, vehicle]);

  title = mode === 'edit'
    ? `Редактиране на автомобил #${vehicle?.vehicle_id ?? ''} — ${vehicle?.make ?? ''} ${vehicle?.model ?? ''} ${vehicle?.model_year ?? ''} ${vehicle?.edition ?? ''}`
    : `${edition?.make || ''} ${edition?.model || ''} ${edition?.year || ''} — ${edition?.edition_name || ''}`;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  // Submit
  const handleSubmit = async (e) => {
    e.preventDefault();

    // resolve colors (create if needed) — SAME as before
    let exterior_color_id = null;
    if (extMode === 'existing' && extValue) exterior_color_id = Number(extValue);
    else if (extMode === 'new') {
      const name = extNew.trim();
      if (!name) return alert('Enter exterior color name or choose existing');
      const r = await fetch(`${apiBase}/api/colors`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ name, type: 'exterior' })
      });
      const d = await r.json(); if (!r.ok) return alert(d?.error || 'Failed to create exterior color');
      exterior_color_id = d.color_id;
    }

    let interior_color_id = null;
    if (intMode === 'existing' && intValue) interior_color_id = Number(intValue);
    else if (intMode === 'new') {
      const name = intNew.trim();
      if (!name) return alert('Enter interior color name or choose existing/none');
      const r = await fetch(`${apiBase}/api/colors`, {
        method: 'POST', headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({ name, type: 'interior' })
      });
      const d = await r.json(); if (!r.ok) return alert(d?.error || 'Failed to create interior color');
      interior_color_id = d.color_id;
    }

    // client-side guard: if custom window, validate
   if (form.status === 'InTransit' && !form.useDefaultEta) {
     const eDate = form.expected_arrival_earliest;
     const lDate = form.expected_arrival_latest;
     if (!eDate || !lDate) {
       return setError('Provide both earliest and latest expected dates or use the default window.');
     }
     if (eDate > lDate) {
       return setError('Earliest date must be before or equal to latest date.');
     }
   }

    const basePayload = {
      vin: String(form.vin || '').trim(),
      release_date: String(form.release_date || '').trim() || null,
      exterior_color_id,
      interior_color_id,
      shop_id: form.shop_id ? Number(form.shop_id) : null,
      status: form.status || 'InTransit',
      asking_price: form.asking_price === '' ? null : Number(form.asking_price),
      mileage: form.mileage === '' ? 0 : Math.trunc(Number(form.mileage)),
      // ETA: send only when InTransit and user chose custom dates
     ...(form.status === 'InTransit' && !form.useDefaultEta
       ? {
           expected_arrival_earliest: form.expected_arrival_earliest,
           expected_arrival_latest: form.expected_arrival_latest,
         }
       : {})
    };

    if (mode === 'create') {
      if (!edition?.edition_id) return alert('No edition selected.');
      const payload = { ...basePayload, edition_id: edition.edition_id };
      const r = await fetch(`${apiBase}/api/vehicles`, {
        method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload)
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) return alert(data?.error || 'Failed to create vehicle');
      alert('Vehicle created');
      onCreated?.({ vehicle_id: data.vehicle_id, ...payload });
      onClose?.();
    } else if (mode === 'edit') {
      // EDIT
      if (!vehicle?.vehicle_id) return alert('No vehicle selected.');
      // Keep edition_id same unless you want to allow editing it; send it to be explicit
      const payload = { ...basePayload, edition_id: vehicle.edition_id };
      const r = await fetch(`${apiBase}/api/vehicles/${vehicle.vehicle_id}`, {
        method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(payload)
      });
      const data = await r.json().catch(()=>({}));
      if (!r.ok) return alert(data?.error || 'Failed to update vehicle');
      alert('Vehicle updated');
      onUpdated?.({ vehicle_id: vehicle.vehicle_id, ...payload });
      onClose?.();
    }
  };

  return (
    <div>
      {/* <h3 style={{ marginTop: 0 }}>Create vehicle for:</h3> */}
      <div style={{ marginBottom: 12, color: '#333' }}><h3>{title}</h3></div>

      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="grid" style={{ display:'grid', gap:10, gridTemplateColumns:'1fr 1fr' }}>
          <input name="vin" placeholder="VIN" value={form.vin} onChange={handleChange} required />
          <input name="release_date" placeholder="Release date (optional)" value={form.release_date} onChange={handleChange} />

          <SelectOrCreate
            label="Цвят на екстериора"
            options={extColors.map(c => ({ value: String(c.color_id), label: c.name_bg }))}
            mode={extMode} setMode={setExtMode}
            value={extValue} setValue={setExtValue}
            newValue={extNew} setNewValue={setExtNew}
          />

          <SelectOrCreate
            label="Цвят на интериора"
            options={intColors.map(c => ({ value: String(c.color_id), label: c.name_bg }))}
            mode={intMode} setMode={setIntMode}
            value={intValue} setValue={setIntValue}
            newValue={intNew} setNewValue={setIntNew}
            allowNone
          />
          <select name="shop_id" value={form.shop_id} onChange={handleChange}>
            <option value="">Магазин (по избор)…</option>
            {shops.map(s => <option key={s.shop_id} value={s.shop_id}>{s.name} - {s.address}</option>)}
          </select>

          <input name="asking_price" type="number" step="0.01" placeholder="Цена" value={form.asking_price} onChange={handleChange} />
          <input name="mileage" type="number" placeholder="Пробег (км)" value={form.mileage} onChange={handleChange} />

         
          <select
            name="status"
            value={form.status}
            onChange={(e) => {
              const status = e.target.value;
              setForm((f) => ({ ...f, status }));
              setForm((f) => ({
                ...f,
                status,
                // when leaving InTransit hide/reset ETA fields
                ...(status !== 'InTransit' ? {
                  expected_arrival_earliest: '',
                  expected_arrival_latest: '',
                  useDefaultEta: true
                } : {})
              }));
            }}
          >
            {STATUSES.map(st => <option key={st} value={st}>{status_to_bg[st]}</option>)}
          </select>

              {/* ETA block – only when InTransit */}
          {form.status === 'InTransit' && (
            <fieldset style={{ border: '1px solid #eee', padding: 12, borderRadius: 8, marginTop: 12 }}>
              <legend>Очаквана дата на пристигане</legend>
              <label style={{ display: 'block', marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={form.useDefaultEta}
                  onChange={(e) => setForm(f => ({ ...f, useDefaultEta: e.target.checked }))}
                /> Използвай стандартния интервал (+60 до +90 дни)
              </label>
              {!form.useDefaultEta && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ marginRight: 8 }}>Най-ранна</label>
                    <input
                      type="date"
                      value={form.expected_arrival_earliest}
                      onChange={(e) => setForm(f => ({ ...f, expected_arrival_earliest: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label style={{ marginRight: 8 }}>Най-късна</label>
                    <input
                      type="date"
                      value={form.expected_arrival_latest}
                      onChange={(e) => setForm(f => ({ ...f, expected_arrival_latest: e.target.value }))}
                    />
                  </div>
                </div>
              )}
            </fieldset>
          )}

        </div>

        <div style={{ marginTop: 12, display:'flex', gap:8 }}>
          <button type="submit">Създай</button>
          <button type="button" onClick={onClose}>Отказ</button>
        </div>
      </form>
    </div>
  );
}

function SelectOrCreate({
  label,
  options,           // [{ value, label }]
  mode, setMode,     // 'existing' | 'new' | 'none'
  value, setValue,
  newValue, setNewValue,
  allowNone = false, // for interior
}) {
  const NEW = '__new__';
  const NONE = '__none__';

  return (
    <div>
      <label style={{ display:'block', fontSize:12, color:'#666', marginBottom:4 }}>{label}</label>
      <select
        value={
          mode === 'new' ? NEW :
          mode === 'none' ? NONE :
          (value || '')
        }
        onChange={(e) => {
          const v = e.target.value;
          if (v === NEW) {
            setMode('new'); setValue('');
          } else if (allowNone && v === NONE) {
            setMode('none'); setValue(''); setNewValue('');
          } else {
            setMode('existing'); setValue(v); setNewValue('');
          }
        }}
        style={{ width:'100%' }}
      >
        <option value="">{label}…</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        <option value={NEW}>➕ Create new…</option>
        {allowNone && <option value={NONE}>— None —</option>}
      </select>

      {mode === 'new' && (
        <input
          type="text"
          placeholder={`New ${label.toLowerCase()} name`}
          value={newValue}
          onChange={e => setNewValue(e.target.value)}
          style={{ width:'100%', marginTop:6 }}
        />
      )}
    </div>
  );
}
