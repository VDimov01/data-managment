import { useState, useMemo } from "react";
import CarImageUploader from "./CarImageUploader";
import AvailableVehicles from "./AvailableVehicles";
import Modal from "./Modal";
import EditionAttributeModal from "./EditionsForm";
import EditionCompare from "./EditionCompare";
import AvailableEditions from "./AvailableEditions";


export default function CarsSection() {
  const [open, setOpen] = useState(false);
  const [editEdition, setEditEdition] = useState(null);

  const [compareIds, setCompareIds] = useState(new Set());
  const compareArray = useMemo(() => Array.from(compareIds), [compareIds]);

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
      {/* <AvailableCars onCarSelect={(car) =>
        setSelectedCars((prev) =>
          prev.some((c) => c.id === car.id)
            ? prev.filter((c) => c.id !== car.id)
            : [...prev, car]
        )
      } multiSelect={true} addButton={true} /> */}

      {/* {compareIds.size > 0 && (
        <CarImageUploader carId={compareIds} carMaker={compareIds} carModel={compareIds} />
      )} */}

      {/* <h2 style={{ marginTop: "20px" }}>Сравнение на коли</h2>
      <CarComparison selectedCars={selectedCars} /> */}


      <h2 style={{ marginTop: "20px" }}>Управление на модели и техните атрибути</h2>
      <AvailableEditions
        apiBase="http://localhost:5000"
        onEdit={(edition) => { setEditEdition(edition); setOpen(true); }}
        selectedIds={compareIds}
        onToggleSelect={toggleSelect}
        onClearSelected={() => setCompareIds(new Set())}
      />

      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
        <button
          onClick={() => { setEditEdition(null); setOpen(true); }}
        >
          Add Edition
        </button>
        <button onClick={() => setCompareIds(new Set())} disabled={compareIds.size === 0}>
          Clear selected for compare ({compareIds.size})
        </button>
      </div>

      <Modal open={open} title="Add Edition + Attributes" onClose={() => { setOpen(false); setEditEdition(null); }}>
        <EditionAttributeModal
          key={editEdition ? `ed-${editEdition.edition_id}` : 'new'}
          apiBase="http://localhost:5000"
          onSaved={() => setOpen(false)}
          edition={editEdition}
        />
      </Modal>

      {compareArray.length >= 1 && (
        <>
          <h3 style={{ marginTop:16 }}>Comparison</h3>
          <EditionCompare apiBase="http://localhost:5000" editionIds={compareArray} />
        </>
      )}
    </div>
  );
}
