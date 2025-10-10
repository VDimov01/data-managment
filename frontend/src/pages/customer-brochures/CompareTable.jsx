import React, { useMemo, useState } from "react";

const GROUP_BG_MAP = {
  'Basic information': 'Основна информация',
  'Car body': 'Купе',
  'Electric motor': 'Електромотор',
  'ICE': 'ДВГ',
  'Battery & Charging': 'Батерия и зареждане',
  'Transmission': 'Трансмисия',
  'Chassis & Steering': 'Ходова част и управление',
  'Wheels & Brakes': 'Гуми и спирачки',
  'Active safety': 'Активна безопасност',
  'Passive safety': 'Пасивна безопасност',
  'Car control & Driving assist': 'Управление и асистенти',
  'Exterior': 'Екстериор',
  'Interior': 'Интериор',
  'Intelligent connectivity': 'Интелигентна свързаност',
  'Seats': 'Седалки',
  'Comfort & Anti-theft systems': 'Комфорт и противокражбени системи',
  'Digital intertainment': 'Дигитално развлечение', // ако в DB е точно така изписано
  'Air conditioner & Refrigerator': 'Климатик и хладилник',
  'Lights': 'Осветление',
  'Glass & Mirrors': 'Стъкла и огледала',
  'Intelligent systems': 'Интелигентни системи',
  'ADAS': 'ADAS',
  'Optional packages': 'Опционални пакети',
  'Customized options': 'Персонализация',
  'Individual features': 'Индивидуални особености',
  'Full Vehicle Warranty': 'Пълна гаранция на автомобила',
  'Misc' : 'Разни',
  'Efficiency' : 'Ефективност',
};

const GROUP_ALIASES = {
  'Miscellaneous': 'Misc',
  'Full Warranty': 'Full Vehicle Warranty',
  'Individual Features': 'Individual features',
};

const SHOW_GROUP_NUMBERS = false;

const HIDDEN_CODES = new Set(['MSRP_AT_LAUNCH']);


function splitGroup(s) {
  const str = String(s || '').trim();
  const m = str.match(/^(\d{1,3})\s+(.*\S)$/);
  if (m) return { seq: Number(m[1]), en: m[2] };
  return { seq: 999, en: str };
}

function normalizeKey(en) {
  const aliased = GROUP_ALIASES[en] || en;
  return aliased;
}

function localizeGroupTitle(rawGroup, langBg = true) {
  const { seq, en } = splitGroup(rawGroup);
  const key = normalizeKey(en);
  const bg = GROUP_BG_MAP[key] || en;
  const title = langBg ? bg : en;
  return SHOW_GROUP_NUMBERS && Number.isFinite(seq) && seq !== 999
    ? `${String(seq).padStart(2, '0')} ${title}`
    : title;
}

export default function CompareTable({ editions, rows, onlyDiff, filter }) {
  const q = (filter || "").trim().toLowerCase();

  // 1) Text filter
  const filtered = useMemo(() => {
    if (!q) return rows;
    return rows.filter(r => {
      const s = `${r.name ?? ""} ${r.code ?? ""} ${r.category ?? ""}`.toLowerCase();
      return s.includes(q);
    });
  }, [rows, q]);

  // 2) Drop rows that are null for ALL editions
  const nonAllNull = useMemo(() => {
    if (!Array.isArray(editions) || editions.length === 0) return filtered;
    return filtered.filter(r =>
      editions.some(ed => {
        if(HIDDEN_CODES.has(r.code)) return false;
        const v = r.values?.[ed.edition_id];
        return v !== null && v !== undefined; // false/0 are kept; only null/undefined are considered empty
      })
    );
  }, [filtered, editions]);

  // 3) Optionally keep only rows with differences
  const finalRows = useMemo(() => {
    if (!onlyDiff) return nonAllNull;
    return nonAllNull.filter(r => {
      const vals = editions.map(ed => r.values?.[ed.edition_id] ?? null);
      return new Set(vals.map(v => JSON.stringify(v))).size > 1;
    });
  }, [nonAllNull, editions, onlyDiff]);

  // 4) Group into sections
  const groups = useMemo(() => {
    const m = new Map();
    finalRows.forEach(r => {
      const k = r.display_group || "Общи";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return Array.from(m.entries()).sort(([a],[b]) => a.localeCompare(b));
  }, [finalRows]);

  if (!editions.length) return <p className="cb-muted">Няма издания за показване.</p>;
  console.log({editions, rows, filtered, nonAllNull, finalRows, groups});
  return (
    <div className="cb-table-wrap">
      <table className="cb-table">
        <thead>
          <tr>
            <th style={{minWidth:220}}>Атрибут</th>
            {editions.map(ed => (
              <th key={ed.edition_id}>
                <div className="cb-ed-h">
                  <div className="cb-ed-line">{ed.make_name} {ed.model_name}</div>
                  <div className="cb-ed-line">{ed.year} — {ed.edition_name}</div>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 && (
            <tr>
              <td colSpan={1 + editions.length} className="cb-muted">Няма редове за показване.</td>
            </tr>
          )}

          {groups.map(([section, items]) => (
            <SectionRows key={section} title={localizeGroupTitle(section, true)} items={items} editions={editions} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionRows({ title, items, editions }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <tr className="cb-section">
        <td colSpan={1 + editions.length}>
          <button className="cb-sec-btn" onClick={() => setOpen(o => !o)}>
            <span className="cb-caret">{open ? "▾" : "▸"}</span> {title}
          </button>
        </td>
      </tr>
      {open && items.map(r => (
        <tr key={r.attribute_id || r.code}>
          <td>
            <div className="cb-attr">
              <div className="cb-attr-name">{r.name_bg}</div>
              <div className="cb-attr-meta">{r.name}{r.unit ? ` (${r.unit})` : ""}</div>
            </div>
          </td>
          {editions.map(ed => {
            const v = r.values?.[ed.edition_id] ?? null;
            return <td key={ed.edition_id}>{formatVal(v, r.data_type, r.unit)}</td>;
          })}
        </tr>
      ))}
    </>
  );
}

function formatVal(v, dt, unit) {
  if (v == null) return "—";
  if (dt === "boolean") return v ? '✅' : '❌';
  if (dt === "int" || dt === "decimal") return unit ? `${v} ${unit}` : String(v);
  return String(v);
}
