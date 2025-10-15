import { useEffect, useMemo, useState } from "react";

/**
 * Generic, UI-only panel. You inject the data ops via props.
 * Looks consistent everywhere because it uses your global atoms.
 */
export default function AttachCustomersPanel({
  // data fns you pass in from wrappers
  listAttached,        // () => Promise<Array<Customer>>
  searchCustomers,     // (q: string) => Promise<Array<Customer>>
  attachToCustomer,    // (customer_id: number) => Promise<void>
  detachFromCustomer,  // (customer_id: number) => Promise<void>

  // optional: initial search query
  initialQuery = "",
}) {
  const [q, setQ] = useState(initialQuery);
  const [attached, setAttached] = useState([]); // [{customer_id, ...}]
  const [loadingAttached, setLoadingAttached] = useState(true);

  const [results, setResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // load current attachments
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoadingAttached(true);
      try {
        const rows = await listAttached();
        if (!alive) return;
        setAttached(Array.isArray(rows) ? rows : []);
      } finally {
        if (alive) setLoadingAttached(false);
      }
    })();
    return () => { alive = false; };
  }, [listAttached]);

  // debounced search
  useEffect(() => {
    const t = setTimeout(async () => {
      const term = q.trim();
      if (!term) { setResults([]); return; }
      setSearchLoading(true);
      try {
        const rows = await searchCustomers(term);
        setResults(Array.isArray(rows) ? rows : []);
      } finally {
        setSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [q, searchCustomers]);

  const attachedIds = useMemo(
    () => new Set(attached.map(a => Number(a.customer_id))),
    [attached]
  );

  const attach = async (id) => {
    await attachToCustomer(id);
    // optimistic + de-dupe
    setAttached(prev => {
      if (prev.some(x => Number(x.customer_id) === Number(id))) return prev;
      const found = results.find(r => Number(r.customer_id) === Number(id));
      return [...prev, found || { customer_id: id }];
    });
  };

  const detach = async (id) => {
    await detachFromCustomer(id);
    setAttached(prev => prev.filter(x => Number(x.customer_id) !== Number(id)));
  };

  const displayName = (c) => {
    const name =
      c.display_name ||
      c.name ||
      c.company_name ||
      [c.first_name, c.middle_name, c.last_name].filter(Boolean).join(" ");
    return name?.trim() || `#${c.customer_id}`;
  };

  const subline = (c) => c.email || c.phone || c.phone_number || c.public_uuid || "—";

  return (
    <div className="attach-panel">
      <div className="attach-grid">
        {/* Left: attached list */}
        <div className="attach-col">
          <h4>Закачени клиенти</h4>
          {loadingAttached ? (
            <p className="text-muted">Зареждане…</p>
          ) : (
            <ul className="attach-list">
              {attached.length === 0 && <li className="text-muted">Няма закачени клиенти.</li>}
              {attached.map(c => (
                <li key={c.customer_id} className="attach-item">
                  <div className="attach-main">
                    <div className="attach-title">{displayName(c)}</div>
                    <div className="attach-sub text-muted">{subline(c)}</div>
                  </div>
                  <div className="btn-row">
                    <button className="btn btn-danger" type="button" onClick={() => detach(c.customer_id)}>
                      Откачи
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: search + add */}
        <div className="attach-col">
          <h4>Търсене на клиенти за закачане</h4>
          <div className="toolbar-row" style={{ padding: 0 }}>
            <input
              className="input input-search"
              placeholder="Име / имейл / компания…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {searchLoading && <p className="text-muted">Търсене…</p>}

          {!searchLoading && q.trim() && (
            <ul className="attach-list">
              {results.length === 0 && <li className="text-muted">Няма намерени клиенти.</li>}
              {results.map(c => (
                <li key={c.customer_id} className="attach-item">
                  <div className="attach-main">
                    <div className="attach-title">{displayName(c)}</div>
                    <div className="attach-sub text-muted">{subline(c)}</div>
                  </div>
                  <div className="btn-row">
                    {attachedIds.has(Number(c.customer_id)) ? (
                      <button className="btn" type="button" onClick={() => detach(c.customer_id)}>
                        Премахни
                      </button>
                    ) : (
                      <button className="btn btn-strong" type="button" onClick={() => attach(c.customer_id)}>
                        Прикрепи
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
