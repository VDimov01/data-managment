/** ---------- Browse tab ---------- */
import React, { useEffect, useState } from "react";
import { buildUrl, makeApi } from "./ContractsSection.jsx";
import AttachmentsModal from "./AttachmentsModal.jsx";

export default function ContractsList({ apiBase, onOpenLatest, onRegenerate, onIssue }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [issuedCount, setIssuedCount] = useState(0);
  const [attachmentsFor, setAttachmentsFor] = useState(null); // {contract_id,...}

  const api = makeApi(apiBase);

  const load = async () => {
    setLoading(true);
    try {
      const url = buildUrl(apiBase, '/api/contracts', { page, limit, q: q.trim() || undefined });
      const r = await fetch(url);
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
      // Tolerate various payload shapes
      setRows(data.items || data.contracts || data.rows || []);
      setTotal(data.total || 0);
      console.log("Contracts: ", data);
    } catch (e) {
      alert(`Load contracts failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  async function cancelAndRelease(row, { force = false } = {}) {
    if (!confirm(`Cancel contract ${row.contract_number} and release vehicles?`)) return;
    try {
      const data = await api(`/contracts/${row.contract_id}/cancel`, { method: "POST", body: { force } });
      alert(`Cancelled. Released ${data.released_count} vehicle(s).`);
      await load();
    } catch (e) {
      // if you ever need to allow cancelling signed contracts:
      if (/signed/i.test(e.message) && confirm("Contract is signed. Force cancel?")) {
        return cancelAndRelease(row, { force: true });
      }
      alert(`Cancel failed: ${e.message}`);
    }
  }

  useEffect(() => { load(); }, [q, page]); // reload on q/page change or after issuing

  const pages = Math.max(1, Math.ceil((total || 0) / limit));

  return (
    <div className="card">
      <div className="card-body">
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="col">
            <label className="lbl">Search</label>
            <input className="inp" placeholder="Number, customer, UUID…" value={q} onChange={e=>setQ(e.target.value)} />
          </div>
          <div className="col" style={{ maxWidth: 220 }}>
            <button className="btn" onClick={load} disabled={loading}>{loading ? "…" : "Reload"}</button>
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>UUID</th>
                <th>Status</th>
                <th>Type</th>
                <th>Customer</th>
                <th>Total</th>
                <th>Items</th>
                <th>Created</th>
                <th style={{width: 340}}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} className="muted">No contracts.</td></tr>
              )}
              {rows.map(r => (
                <tr key={r.contract_id}>
                  <td>{r.contract_number || r.contract_id}</td>
                  <td className="muted mono">{r.uuid}</td>
                  <td>{(r.status || 'draft').toUpperCase()}</td>
                  <td>{r.type}</td>
                  <td>{r.customer_display_name || r.customer_name || r.customer || "—"}</td>
                  <td>{(r.currency_code || r.currency || 'BGN')} {r.total ?? r.subtotal ?? '0.00'}</td>
                  <td>{r.items_count ?? r.item_count ?? '—'}</td>
                  <td className="muted">{(r.created_at || "").replace("T"," ").slice(0,19)}</td>
                  <td>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      <button className="btn" onClick={() => onOpenLatest(r.uuid)}>Open latest PDF</button>
                      <button className="btn" onClick={() => onRegenerate(r.contract_id)}>Regenerate PDF</button>
                      <button className="btn" onClick={() => setAttachmentsFor(r)}>Приложения към договора</button>
                      {String(r.status).toLowerCase() !== 'issued' && (
                        <button className="btn success" onClick={async () => {await onIssue(r.contract_id); await load();}}>Issue</button>
                      )}
                      {String(r.status).toLowerCase() !== 'withdrawn' && String(r.status).toLowerCase() !== 'draft' && (

                        <button
                        className="btn danger"
                        onClick={() => cancelAndRelease(r)}
                        disabled={r.status === "withdrawn" || r.status === "draft"}
                        title={r.status === "withdrawn" ? "Already cancelled" : "Cancel & release vehicles"}
                        >
                      Cancel & release
                    </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="pager">
            <button className="btn" disabled={page<=1} onClick={()=>setPage(p=>Math.max(1,p-1))}>Prev</button>
            <span>Page {page} / {pages}</span>
            <button className="btn" disabled={page>=pages} onClick={()=>setPage(p=>Math.min(pages,p+1))}>Next</button>
          </div>
        )}
        {attachmentsFor && (
        <AttachmentsModal
          apiBase={apiBase}
          contract={attachmentsFor}
          onClose={() => setAttachmentsFor(null)}
        />
      )}
      </div>
    </div>
  );
}