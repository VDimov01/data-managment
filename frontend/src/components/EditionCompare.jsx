// EditionCompare.jsx
import { useEffect, useMemo, useState } from "react";

export default function EditionCompare({ apiBase = "http://localhost:5000", editionIds = null }) {
  const [editionIdsText, setEditionIdsText] = useState(""); // legacy input
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [data, setData] = useState(null);

  // reuse a single loader
  const fetchCompare = async (ids) => {
    if (!ids?.length) { setData(null); return; }
    const res = await fetch(`${apiBase}/api/editions/compare`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ edition_ids: ids, only_differences: onlyDiff })
    });
    const json = await res.json();
    if (!res.ok) { console.error(json); alert(json.error || "compare failed"); return; }
    setData(json);
  };

  // when external editionIds provided, load automatically
  useEffect(() => {
    if (Array.isArray(editionIds)) fetchCompare(editionIds).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(editionIds), onlyDiff, apiBase]);

  // button handler for legacy manual mode
  const loadCompareManual = async () => {
    const ids = editionIdsText.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
    await fetchCompare(ids);
  };

  // ... keep your improved grouped + pagination version,
  // or your original table as you prefer ...
  // For brevity, below is your original table block with the top controls
  // adjusted to hide input when editionIds is provided.

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        {!Array.isArray(editionIds) && (
          <>
            <input
              placeholder="Edition IDs, e.g. 12,15,19"
              value={editionIdsText}
              onChange={e => setEditionIdsText(e.target.value)}
              style={{ flex:1 }}
            />
            <button onClick={loadCompareManual}>Compare</button>
          </>
        )}
        <label style={{ display:'flex', alignItems:'center', gap:6, marginLeft: 'auto' }}>
          <input type="checkbox" checked={onlyDiff} onChange={() => setOnlyDiff(v => !v)} />
          Only differences
        </label>
      </div>

      {!data ? null : (
        <div style={{ overflowX:'auto', marginTop:12 }}>
          <table style={{ borderCollapse:'collapse', width:'100%' }}>
            <thead>
              <tr>
                <th style={th}>Attribute</th>
                {data.editions.map(ed => (
                  <th key={ed.edition_id} style={th}>
                    {ed.make_name} {ed.model_name} {ed.year} — {ed.edition_name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map(row => {
                const vals = data.editions.map(ed => row.values[ed.edition_id] ?? null);
                const differ = new Set(vals.map(v => JSON.stringify(v))).size > 1;
                return (
                  <tr key={row.code} style={{ background: differ ? 'rgba(255,220,0,0.1)' : undefined }}>
                    <td style={td}>
                      <div style={{ fontWeight:600 }}>{row.name_bg}</div>
                      <div style={{ fontSize:12, color:'#666' }}>{row.code} {row.unit ? `(${row.unit})` : ''}</div>
                    </td>
                    {data.editions.map(ed => {
                      const v = row.values[ed.edition_id];
                      return <td key={ed.edition_id} style={td}>{formatVal(v, row.data_type, row.unit)}</td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const th = { borderBottom:'1px solid #ddd', textAlign:'left', padding:'8px' };
const td = { borderBottom:'1px solid #f0f0f0', padding:'8px', verticalAlign:'top' };

function formatVal(v, dt, unit) {
  if (v === null || v === undefined) return '—';
  if (dt === 'boolean') return v ? '✅' : '❌';
  if (dt === 'decimal') return unit ? `${v} ${unit}` : String(v);
  if (dt === 'int') return unit ? `${v} ${unit}` : String(v);
  return String(v);
}
