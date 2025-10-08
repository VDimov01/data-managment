import { useEffect, useMemo, useState } from "react";
import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from "../../services/customerApi";
import CustomerList from "./CustomerList";
import CustomerForm from "./CustomerForm";
import ConfirmDialog from "./ConfirmDialog";

export default function CustomerSection() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [typeTab, setTypeTab] = useState("All"); // All | Individual | Company

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const [openForm, setOpenForm] = useState(false);
  const [editing, setEditing] = useState(null); // customer row or null

  const [confirm, setConfirm] = useState({ open: false, onConfirm: null, title: "", message: "" });

  // Debounce search text -> query param
  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch list (server-side pagination) when search/page/limit changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setErr(null);
      try {
        const data = await listCustomers({ q: search, page, limit });
        if (cancelled) return;
        setRows(data.customers || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
      } catch (e) {
        if (cancelled) return;
        setErr(e.message || "Неуспешно зареждане на данни");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [search, page, limit]);

  // Client-side type filter (we're not adding server param right now)
  const filtered = useMemo(() => {
    if (typeTab === "All") return rows;
    return rows.filter(r => r.customer_type === typeTab);
  }, [rows, typeTab]);

  const openCreate = () => { setEditing(null); setOpenForm(true); };
  const openEdit = (row) => { setEditing(row); setOpenForm(true); };

  const onSave = async (payload, existing) => {
    if (existing) {
      await updateCustomer(existing.customer_id, payload);
      // Refresh current page
      const data = await listCustomers({ q: search, page, limit });
      setRows(data.customers || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } else {
      await createCustomer(payload);
      // Reload first page to place new at the top
      const data = await listCustomers({ q: search, page: 1, limit });
      setPage(1);
      setRows(data.customers || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    }
    setOpenForm(false);
    setEditing(null);
  };

  const onDelete = (row) => {
    setConfirm({
      open: true,
      title: "Изтриване на клиент?",
      message: `Това ще изтрие постоянно "${row.display_name || (row.company_name || `${row.first_name || ""} ${row.last_name || ""}`)}".`,
      onConfirm: async () => {
        try {
          await deleteCustomer(row.customer_id);
          // If last item on page was removed, go to previous page when possible
          const newCount = filtered.length - 1;
          const nextPage = newCount === 0 && page > 1 ? page - 1 : page;
          const data = await listCustomers({ q: search, page: nextPage, limit });
          setPage(nextPage);
          setRows(data.customers || []);
          setTotal(data.total || 0);
          setTotalPages(data.totalPages || 1);
        } catch (e) {
          alert(e.message || "Неуспешно изтриване");
        } finally {
          setConfirm({ open: false, onConfirm: null, title: "", message: "" });
        }
      }
    });
  };

  const copyPublicLink = (row) => {
    const base = window.location.origin || "";
    const url = `${base}/customer/${row.public_uuid}`;
    navigator.clipboard.writeText(url).then(
      () => alert("Public link copied to clipboard"),
      () => alert(url) // fallback: show the link if clipboard fails
    );
  };

  return (
    <div className="cust-wrap">
      <div className="cust-toolbar">
        <div className="cust-toolbar-left">
          <input
            className="cust-input"
            placeholder="Търсене по име, имейл, телефон, град, UUID…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
          <div className="cust-tabs">
            {["All","Individual","Company"].map(t => (
              <button
                key={t}
                className={`cust-tab ${typeTab === t ? "active" : ""}`}
                onClick={() => setTypeTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="cust-toolbar-right">
          <select
            className="cust-select"
            value={limit}
            onChange={(e) => { setLimit(Number(e.target.value)); setPage(1); }}
            title="Rows per page"
          >
            {[10,20,50,100].map(n => <option key={n} value={n}>{n} / страница</option>)}
          </select>
          <button className="cust-btn primary" onClick={openCreate}>Добави клиент</button>
        </div>
      </div>

      {loading && <div className="cust-msg">Зареждане на клиенти…</div>}
      {err && <div className="cust-msg error">{err}</div>}

      {!loading && !err && (
        <>
          <CustomerList
            rows={filtered}
            page={page}
            limit={limit}
            total={total}
            totalPages={totalPages}
            onEdit={openEdit}
            onDelete={onDelete}
            onCopyLink={copyPublicLink}
          />

          <div className="cust-pager">
            <button
              className="cust-btn"
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
            >Предишна</button>
            <span className="cust-pager-text">Страница {page} от {totalPages}</span>
            <button
              className="cust-btn"
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            >Следваща</button>
          </div>
        </>
      )}

      {/* Modal: Create/Edit */}
      {openForm && (
        <CustomerForm
          onClose={() => { setOpenForm(false); setEditing(null); }}
          onSave={onSave}
          editCustomer={editing}
        />
      )}

      {/* Confirm dialog */}
      {confirm.open && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          onCancel={() => setConfirm({ open:false, onConfirm:null, title:"", message:"" })}
          onConfirm={confirm.onConfirm}
        />
      )}
    </div>
  );
}
