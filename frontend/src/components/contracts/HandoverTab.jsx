// frontend/src/components/contracts/HandoverTab.jsx
import React from "react";
import { api } from "../../services/api";
import Modal from '../Modal';
import { formatDateDMYDateOnly } from "../../utils/dates";

function fmtDateDisplay(isoish) {
  if (!isoish) return "—";
  try {
    const d = new Date(isoish);
    if (!isNaN(d)) return d.toLocaleString();
    return String(isoish).replace("T", " ");
  } catch {
    return String(isoish);
  }
}

function toDateInputValue(isoish) {
  if (!isoish) return "";
  const d = new Date(isoish);
  if (isNaN(d)) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const statusBG = {
  draft: "Чернова",
  issued: "Издаден",
  signed: "Подписан",
  void: "Анулиран",
  cancelled: "Отменен",
};

export default function HandoverTab({ apiBase, contract }) {
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  const load = async () => {
    if (!contract?.contract_id) return;
    setLoading(true);
    try {
      const data = await api(`/handover/by-contract/${contract.contract_id}`);
      setRows(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      alert(`Handover list failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contract?.contract_id]);

  const openPdf = async (id) => {
    try {
      const data = await api(`/handover/${id}/pdf/latest`);
      if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      alert(`Open PDF failed: ${e.message}`);
    }
  };

  const createDrafts = async () => {
    if (!contract?.contract_id) return;
    if (!confirm("Създаване на чернови за всички линии по договора?")) return;
    setCreating(true);
    try {
      await api(`/handover/bulk-from-contract/${contract.contract_id}`, { method: "POST" });
      await load();
    } catch (e) {
      alert(`Create drafts failed: ${e.message}`);
    } finally {
      setCreating(false);
    }
  };

  // inside HandoverTab.jsx
const doIssue = async (id) => {
  try {
    const row = rows.find(r => r.handover_record_id === id);
    if (!row) return;

    const payload = {
      handover_date: row.handover_date || null,  // e.g. 'YYYY-MM-DD' from the date input
      location: row.location || null,
      odometer_km: (row.odometer_km === "" || row.odometer_km == null) ? null : Number(row.odometer_km),
    };

    const data = await api(`/handover/${id}/issue`, { method: "POST", body: payload });
    if (data?.pdf?.signedUrl) window.open(data.pdf.signedUrl, "_blank", "noopener,noreferrer");
    await load(); // refresh after issuing
  } catch (e) {
    alert(`Generate PDF failed: ${e.message}`);
  }
};


  const doRegen = async (id) => {
    try {
      const data = await api(`/handover/${id}/pdf`, { method: "POST" });
      if (data?.pdf?.signedUrl) window.open(data.pdf.signedUrl, "_blank", "noopener,noreferrer");
      await load();
    } catch (e) {
      alert(`Regenerate PDF failed: ${e.message}`);
    }
  };

  const doSigned = async (id) => {
    try {
      await api(`/handover/${id}/mark-signed`, { method: "POST" });
      await load();
    } catch (e) {
      alert(`Mark signed failed: ${e.message}`);
    }
  };

  const doVoid = async (id) => {
    if (!confirm("Анулиране на този протокол?")) return;
    try {
      await api(`/handover/${id}/void`, { method: "POST" });
      await load();
    } catch (e) {
      alert(`Void failed: ${e.message}`);
    }
  };

  // local patch (optimistic UI)
  const patchRowLocal = (id, patch) => {
    setRows((prev) => prev.map((r) => (r.handover_record_id === id ? { ...r, ...patch } : r)));
  };

  // persist patch — PATCH first, fallback to PUT for older routes
const doUpdate = async (id, patch) => {
  const hr = rows.find(r => r.handover_record_id === id);
  if (!hr || hr.status !== "draft") return;

  const merged = { ...hr, ...patch };
  const body = {};
  // only include keys you care about; let PATCH handler ignore missing ones
  if ('handover_date' in merged) body.handover_date = merged.handover_date || null;
  if ('location' in merged) body.location = merged.location || null;
  if ('odometer_km' in merged) body.odometer_km = merged.odometer_km ?? null;
  if ('notes' in merged) body.notes = merged.notes || null;

  patchRowLocal(id, patch);
  const resp = await api(`/handover/${id}`, { method: "PATCH", body });
  if (resp) {
    setRows(prev => prev.map(r => r.handover_record_id === id ? { ...r, ...resp } : r));
  }
};



      return (
      <div>
        <div className="toolbar-row" style={{ gap: 8, marginBottom: 10 }}>
          <button className="btn" onClick={load} disabled={loading}>
            {loading ? "…" : "Презареди"}
          </button>
          <button className="btn btn-primary" onClick={createDrafts} disabled={creating || loading}>
            {creating ? "Създаване…" : "Създай чернови (всички автомобили)"}
          </button>
        </div>

        {rows.length === 0 && <div className="text-muted">Няма създадени приемо-предавателни протоколи.</div>}

        {rows.map((row) => {
          const isDraft = row.status === "draft";
          return (
            <div key={row.handover_record_id} className="card" style={{ marginBottom: 10 }}>
              <div className="card-body">
                <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>
                      {row.make_name} {row.model_name} {row.year ? `(${row.year})` : ""} — {row.edition_name}
                    </div>
                    <div className="text-muted">VIN: {row.vin || "—"}</div>
                  </div>
                  <div>
                    <span className="text-muted">Статус: </span>
                    <span style={{ fontWeight: 700, textTransform: "uppercase" }}>
                      {statusBG[row.status] || row.status}
                    </span>
                  </div>
                </div>

              {isDraft ? (
              <>
                {/* 3-up grid */}
                <div className="handover-grid">
                  <div>
                    <label className="lbl">Дата на предаване</label>
                    <input
                      type="date"
                      className="input"
                      value={toDateInputValue(row.handover_date)}
                      onChange={(e) =>
                        patchRowLocal(row.handover_record_id, { handover_date: e.target.value || null })
                      }
                      onBlur={(e) => doUpdate(row.handover_record_id, { handover_date: e.target.value || null })}
                    />
                  </div>

                  <div>
                    <label className="lbl">Местоположение</label>
                    <input
                      type="text"
                      className="input"
                      value={row.location || ""}
                      onChange={(e) => patchRowLocal(row.handover_record_id, { location: e.target.value })}
                      onBlur={(e) => doUpdate(row.handover_record_id, { location: e.target.value || null })}
                    />
                  </div>

                  <div>
                    <label className="lbl">Пробег (км)</label>
                    <input
                      type="number"
                      className="input"
                      min={0}
                      value={row.odometer_km ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value || 0, 10));
                        patchRowLocal(row.handover_record_id, { odometer_km: v === "" ? null : v });
                      }}
                      onBlur={(e) => {
                        const v = e.target.value === "" ? null : Math.max(0, parseInt(e.target.value || 0, 10));
                        doUpdate(row.handover_record_id, { odometer_km: v });
                      }}
                    />
                  </div>
                </div>

                {/* Notes — full width, taller */}
                <div className="handover-grid one">
                  <div>
                    <label className="lbl">Бележки</label>
                    <textarea
                      className="input handover-notes"
                      rows={4}
                      value={row.notes || ""}
                      onChange={(e) => patchRowLocal(row.handover_record_id, { notes: e.target.value })}
                      onBlur={(e) => doUpdate(row.handover_record_id, { notes: e.target.value || null })}
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="handover-grid">
                  <div>
                    <label className="lbl">Дата на предаване</label>
                    <div className="box">{fmtDateDisplay(row.handover_date)}</div>
                  </div>
                  <div>
                    <label className="lbl">Местоположение</label>
                    <div className="box">{row.location || "—"}</div>
                  </div>
                  <div>
                    <label className="lbl">Пробег (км)</label>
                    <div className="box">{row.odometer_km ?? "—"}</div>
                  </div>
                </div>

                <div className="handover-grid one">
                  <div>
                    <label className="lbl">Бележки</label>
                    <div className="box handover-notes-display">{row.notes || "—"}</div>
                  </div>
                </div>
              </>
            )}


                <div className="actions" style={{ justifyContent: "flex-start" }}>
                  {isDraft ? (
                    <button className="btn btn-success" onClick={() => doIssue(row.handover_record_id)}>
                      Генерирай PDF
                    </button>
                  ) : (
                    <>
                      <button className="btn" onClick={() => openPdf(row.handover_record_id)}>
                        Отвори
                      </button>
                      <button className="btn" onClick={() => doRegen(row.handover_record_id)}>
                        Регенерирай
                      </button>
                    </>
                  )}
                  {row.status !== "signed" && row.status === "issued" && (
                    <button className="btn" onClick={() => doSigned(row.handover_record_id)}>
                      Маркирай като подписан
                    </button>
                  )}
                  {row.status !== "void" && row.status === "issued" && (
                    <button className="btn btn-danger" onClick={() => doVoid(row.handover_record_id)}>
                      Анулирай
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );

}
