// EditionCompare.jsx
import { useEffect, useMemo, useState } from "react";

const GROUP_BG_MAP = {
  '01 Basic information': 'Основна информация',
  '02 Car body': 'Купе',
  '03 Electric motor': 'Електромотор',
  '04 ICE': 'ДВГ',
  '05 Battery & Charging': 'Батерия и зареждане',
  '06 Transmission': 'Трансмисия',
  '07 Chassis & Steering': 'Ходова част и управление',
  '08 Wheels & Brakes': 'Гуми и спирачки',
  '09 Active safety': 'Активна безопасност',
  '10 Passive safety': 'Пасивна безопасност',
  '11 Car control & Driving assist': 'Управление и асистенти',
  '12 Exterior': 'Екстериор',
  '13 Interior': 'Интериор',
  '14 Intelligent connectivity': 'Интелигентна свързаност',
  '15 Seats': 'Седалки',
  '16 Comfort & Anti-theft systems': 'Комфорт и противокражбени системи',
  '17 Digital intertainment': 'Дигитално развлечение',
  '18 Air conditioner & Refrigerator': 'Климатик и хладилник',
  '19 Lights': 'Осветление',
  '20 Glass & Mirrors': 'Стъкла и огледала',
  '21 Intelligent systems': 'Интелигентни системи',
  'ADAS': 'ADAS',
  'Optional packages': 'Опционални пакети',
  'Customized options': 'Персонализация',
  'Individual features': 'Индивидуални особености',
  '25 Full Vehicle Warranty': 'Пълна гаранция на автомобила',
};

// clean translate that tolerates unknown keys
function localizeGroupTitle(enLabel) {
  return GROUP_BG_MAP[enLabel] || enLabel;
}

// extract the numeric prefix (“01 ” -> 1). Unnumbered groups go to the end.
function groupRank(label) {
  if (!label) return 9999;
  const m = /^(\d{1,2})\b/.exec(label.trim());
  return m ? parseInt(m[1], 10) : 9999;
}

export default function EditionCompare({ apiBase = "https://diligent-commitment-production-b9a8.up.railway.app:8080", editionIds = null }) {
  const [editionIdsText, setEditionIdsText] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [query, setQuery] = useState("");          // ← search box
  const [data, setData] = useState(null);

  const fetchCompare = async (ids) => {
    if (!ids?.length) { setData(null); return; }
    const res = await fetch(`${apiBase}/api/editions/compare`, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ edition_ids: ids, only_differences: false }), // we filter client-side
      credentials: 'include'
    });
    const json = await res.json();
    if (!res.ok) { console.error(json); alert(json.error || "compare failed"); return; }
    setData(json);
  };

  // auto-load when editionIds prop provided
  useEffect(() => {
    if (Array.isArray(editionIds)) fetchCompare(editionIds).catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(editionIds), apiBase]);

  const loadCompareManual = async () => {
    const ids = editionIdsText.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n));
    await fetchCompare(ids);
  };

  // computed helpers
  const editions = data?.editions ?? [];
  const rowsRaw = data?.rows ?? [];

  // 1) text filter
  const q = query.trim().toLowerCase();
  const rowsFiltered = useMemo(() => {
    if (!q) return rowsRaw;
    return rowsRaw.filter(r => {
      const g = (r.display_group || r.category || '').toLowerCase();
      const s = `${r.name ?? ''} ${r.name_bg ?? ''} ${r.code ?? ''} ${g}`.toLowerCase();
      return s.includes(q);
    });
  }, [rowsRaw, q]);

  // 2) only differences (client-side)
  const rowsDiffed = useMemo(() => {
    if (!onlyDiff) return rowsFiltered;
    return rowsFiltered.filter(r => {
      const vals = editions.map(ed => r.values?.[ed.edition_id] ?? null);
      return new Set(vals.map(v => JSON.stringify(v))).size > 1;
    });
  }, [rowsFiltered, editions, onlyDiff]);

  // 3) group by display_group and sort groups/items
  const grouped = useMemo(() => {
    const map = new Map();
    rowsDiffed.forEach(r => {
      const g = r.display_group || r.category || 'Other';
      if (!map.has(g)) map.set(g, []);
      map.get(g).push(r);
    });

    // sort items inside each group
    for (const [g, arr] of map.entries()) {
      arr.sort((a, b) => {
        const oa = Number.isFinite(a.display_order) ? a.display_order : 9999;
        const ob = Number.isFinite(b.display_order) ? b.display_order : 9999;
        if (oa !== ob) return oa - ob;
        return (a.name_bg || a.name || '').localeCompare(b.name_bg || b.name || '');
      });
    }

    // stable group sort by numeric prefix then by label
    return Array.from(map.entries()).sort(([ga], [gb]) => {
      const ra = groupRank(ga);
      const rb = groupRank(gb);
      if (ra !== rb) return ra - rb;
      return ga.localeCompare(gb);
    });
  }, [rowsDiffed]);

  return (
    <div className="cb-table-wrap" style={{maxWidth:'100%', overflowX:'auto'}}>
      {/* Top controls */}
      <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:12}}>
        {!Array.isArray(editionIds) && (
          <>
            <input
              placeholder="Edition IDs, comma-separated (e.g. 101,102)"
              value={editionIdsText}
              onChange={e => setEditionIdsText(e.target.value)}
              style={{flex:1}}
            />
            <button onClick={loadCompareManual}>Compare</button>
          </>
        )}
        <input
          placeholder="Search attributes…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{flex:1}}
        />
        <label style={{display:'flex', alignItems:'center', gap:6}}>
          <input type="checkbox" checked={onlyDiff} onChange={() => setOnlyDiff(v => !v)} />
          Only differences
        </label>
      </div>

      {!data ? null : (
        <table className="cb-table" style={{width:'100%', borderCollapse:'collapse'}}>
          <thead>
            <tr>
              <th style={th}>Атрибут</th>
              {editions.map(ed => (
                <th key={ed.edition_id} style={th}>
                  <div className="cb-ed-h">
                    <div className="cb-ed-line">{ed.make_name} {ed.model_name}</div>
                    <div className="cb-ed-line">{ed.year} — {ed.edition_name}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={1 + editions.length} style={td} className="cb-muted">Няма редове за показване.</td></tr>
            )}

            {grouped.map(([groupTitle, items]) => (
              <SectionRows
                key={groupTitle}
                title={localizeGroupTitle(groupTitle)}
                items={items}
                editions={editions}
              />
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SectionRows({ title, items, editions }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr className="cb-section">
        <td colSpan={1 + editions.length} style={{background:'#f7f7f8', fontWeight:600, padding:'8px 10px', borderTop:'1px solid #e9e9ea'}}>
          <button className="cb-sec-btn" onClick={() => setOpen(o => !o)} style={{all:'unset', cursor:'pointer'}}>
            <span className="cb-caret" style={{display:'inline-block', width:16}}>{open ? '▾' : '▸'}</span> {title}
          </button>
        </td>
      </tr>
      {open && items.map(r => (
        <tr key={r.attribute_id || r.code}>
          <td style={td}>
            <div className="cb-attr">
              <div className="cb-attr-name">{r.name_bg || r.name}</div>
              <div className="cb-attr-meta" style={{color:'#6b7280', fontSize:12}}>
                {r.name}{r.unit ? ` (${r.unit})` : ""} · <code style={{color:'#6b7280'}}>{r.code}</code>
              </div>
            </div>
          </td>
          {editions.map(ed => {
            const v = r.values?.[ed.edition_id] ?? null;
            return <td key={ed.edition_id} style={td}>{formatVal(v, r.data_type, r.unit)}</td>;
          })}
        </tr>
      ))}
    </>
  );
}

const th = { borderBottom:'1px solid #ddd', textAlign:'left', padding:'8px', position:'sticky', top:0, background:'#fff' };
const td = { borderBottom:'1px solid #f0f0f0', padding:'8px', verticalAlign:'top' };

function formatVal(v, dt, unit) {
  if (v === null || v === undefined) return '—';
  if (dt === 'boolean') return v ? '✅' : '❌';
  if (dt === 'decimal' || dt === 'int') return unit ? `${v} ${unit}` : String(v);
  return String(v);
}
