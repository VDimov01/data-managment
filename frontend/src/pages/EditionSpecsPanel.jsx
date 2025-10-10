import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api";

export default function EditionSpecsPanel({
  apiBase = "http://localhost:5000",
  editionId,
  lang = "bg",
}) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  const HIDDEN_CODES = new Set(['MSRP_AT_LAUNCH', 'MSRP_LAUNCH']); // extend if needed

  // ----- Group ordering + BG translations -----
  const FALLBACK_GROUP_ORDER = [
    "Basic information","Car body","Electric motor","ICE","Battery & Charging",
    "Transmission","Chassis & Steering","Wheels & Brakes","Active safety",
    "Passive safety","Car control & Driving assist","Exterior","Interior",
    "Intelligent connectivity","Seats","Comfort & Anti-theft systems",
    "Digital intertainment","Air conditioner & Refrigerator","Lights",
    "Glass & Mirrors","Intelligent systems","ADAS","Optional packages",
    "Customized options","Individual features","Full Vehicle Warranty",
  ];

  const GROUP_BG = {
    "Basic information": "Основна информация",
    "Car body": "Купе",
    "Electric motor": "Електродвигател",
    "ICE": "ДВГ",
    "Battery & Charging": "Батерия и зареждане",
    "Transmission": "Трансмисия",
    "Chassis & Steering": "Окачване и управление",
    "Wheels & Brakes": "Колела и спирачки",
    "Active safety": "Активна безопасност",
    "Passive safety": "Пасивна безопасност",
    "Car control & Driving assist": "Контроли и асистенти",
    "Exterior": "Екстериор",
    "Interior": "Интериор",
    "Intelligent connectivity": "Свързаност",
    "Seats": "Седалки",
    "Comfort & Anti-theft systems": "Комфорт и защита",
    "Digital intertainment": "Дигитални развлечения",
    "Air conditioner & Refrigerator": "Климатик и охлаждане",
    "Lights": "Осветление",
    "Glass & Mirrors": "Стъкла и огледала",
    "Intelligent systems": "Интелигентни системи",
    "ADAS": "ADAS",
    "Optional packages": "Опционални пакети",
    "Customized options": "Персонализирани опции",
    "Individual features": "Индивидуални екстри",
    "Full Vehicle Warranty": "Гаранция на автомобила",
  };

  function parseDisplayGroup(displayGroup, category) {
    if (typeof displayGroup === "string") {
      const m = displayGroup.match(/^\s*(\d{1,3})\s+(.*\S)\s*$/);
      if (m) return { seq: Number(m[1]), en: m[2] };
      const trimmed = displayGroup.trim();
      if (trimmed) {
        const idx = FALLBACK_GROUP_ORDER.indexOf(trimmed);
        return { seq: idx >= 0 ? idx + 1 : 999, en: trimmed };
      }
    }
    return { seq: 999, en: (category || "Other") };
  }

  const [openGroups, setOpenGroups] = useState(new Set());
useEffect(() => {
  // Open all groups by default whenever the data changes
  setOpenGroups(new Set([...groupsMap.keys()]));
}, [groupsMap]);

  // ---------- Loader ----------
  const loadEditionAttributes = async (edId) => {
  const payload = await api(`/public/editions/${edId}/attributes?lang=${lang}`);
  const list = Array.isArray(payload?.items) ? payload.items : [];
  setRows(list);
};



  // ---- Effect ----
  useEffect(() => {
    let alive = true;
    (async () => {
      setErr(null);
      setRows(null);
      try {
        await loadEditionAttributes(editionId);
      } catch (e) {
        if (alive) setErr(e.message || "Failed to load specs");
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiBase, editionId, lang]);

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

  // ---- Grouping (stable hook order) ----
  const groupsMap = useMemo(() => {
  const m = new Map();
  if (!Array.isArray(rows)) return m;
  for (const r of rows) {
    const { seq, en } = splitGroup(r.display_group);
    //const key = normalizeKey(en);

    const groupTitle = GROUP_BG[en] || en;
    if (!m.has(groupTitle)) m.set(groupTitle, []);
    m.get(groupTitle).push(r);
  }
  return m;
}, [rows]);


  if (err) return <div style={{ padding: 12, color: "#b00020" }}>Error: {err}</div>;
  if (!rows) return <div style={{ padding: 12 }}>Loading specs…</div>;
  if (!rows.length) return <div style={{ padding: 12, opacity: 0.7 }}>Няма данни.</div>;

  // Add these just above your return:


const toggleGroup = (group) =>
  setOpenGroups((prev) => {
    const n = new Set(prev);
    n.has(group) ? n.delete(group) : n.add(group);
    return n;
  });

// Optional: quick controls (use if you want)
const expandAll = () => setOpenGroups(new Set([...groupsMap.keys()]));
const collapseAll = () => setOpenGroups(new Set());

return (
  <div className="public-specs">
    {/* Optional controls */}
    <div className="public-specs__controls">
      <button className="public-specs__control-btn" onClick={expandAll}>Разгъни всички</button>
      <button className="public-specs__control-btn" onClick={collapseAll}>Свий всички</button>
    </div>

    {[...groupsMap.entries()].map(([groupTitleBg, items]) => {
      const isOpen = openGroups.has(groupTitleBg);
      return (
        <section key={groupTitleBg} className="public-specs__group">
          <button
            type="button"
            className={`public-specs__group-header ${isOpen ? "is-open" : ""}`}
            onClick={() => toggleGroup(groupTitleBg)}
            aria-expanded={isOpen}
          >
            <span className="public-specs__group-title">{groupTitleBg}</span>
            <span className="public-specs__chevron" aria-hidden>⌄</span>
          </button>

          <div className={`public-specs__body ${isOpen ? "is-open" : ""}`}>
            <ul className="public-specs__list">
              {items.map((a, idx) => (
                <li
                  key={a.code}
                  className={`public-specs__item ${idx % 2 ? "is-alt" : ""}`}
                >
                  <div className="public-specs__label">
                    {a.name_bg || a.label || a.code}
                  </div>
                  <div className="public-specs__value">
                    {formatValue(a.value, a.unit)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    })}
  </div>
);


}

function formatValue(v, unit) {
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return "—";
  if (typeof v === "boolean") return v ? "✅" : "❌";
  if (typeof v === "number" && unit) return `${v} ${unit}`;
  if (typeof v === "string" && unit && !v.endsWith(unit)) return `${v} ${unit}`;
  return String(v);
}

