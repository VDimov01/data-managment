import { useState, useMemo } from "react";
import Modal from "../Modal";
import EditionAttributeModal from "./EditionsForm";
import EditionCompare from "./EditionCompare";
import AvailableEditions from "./AvailableEditions";


export default function CarsSection() {
  const [open, setOpen] = useState(false);
  const [editEdition, setEditEdition] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [compareIds, setCompareIds] = useState(new Set());
  const compareArray = useMemo(() => Array.from(compareIds), [compareIds]);

  const handleEditionSaved = () => {setRefreshKey(k => k + 1);};

  const toggleSelect = (edition) => {
    setCompareIds(prev => {
      const next = new Set(prev);
      const id = edition.edition_id || edition.id;
      if (!id) return next;
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <h2 style={{ marginTop: "20px" }}>Управление на модели и техните атрибути</h2>
      <AvailableEditions
        refreshKey={refreshKey}
        apiBase={process.env.VITE_API_BASE || "https://data-managment-production.up.railway.app:5000"}
        onEdit={(edition) => { setEditEdition(edition); setOpen(true); }}
        selectedIds={compareIds}
        onToggleSelect={toggleSelect}
        onClearSelected={() => setCompareIds(new Set())}
      />

      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
        <button
          onClick={() => { setEditEdition(null); setOpen(true); }}
        >
          Добави ново издание
        </button>
        <button onClick={() => setCompareIds(new Set())} disabled={compareIds.size === 0}>
          Изчисти избраните за сравнение ({compareIds.size})
        </button>
      </div>

      <Modal open={open} title="Добави издание + атрибути" onClose={() => { setOpen(false); setEditEdition(null); }}>
        <EditionAttributeModal
          key={editEdition ? `ed-${editEdition.edition_id}` : 'new'}
          apiBase={process.env.VITE_API_BASE || "https://data-managment-production.up.railway.app:5000"}
          onSaved={() => setOpen(true)}
          edition={editEdition}
          onCreated={handleEditionSaved}
          onUpdated={handleEditionSaved}
        />
      </Modal>

      {compareArray.length >= 1 && (
        <>
          <h3 style={{ marginTop:16 }}>Сравнение</h3>
          <EditionCompare apiBase={process.env.VITE_API_BASE || "https://data-managment-production.up.railway.app:5000"} editionIds={compareArray} />
        </>
      )}
    </div>
  );
}
