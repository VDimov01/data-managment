// frontend/src/components/offers/OffersSection.jsx
import React, { useState } from "react";
import { api } from "../../services/api";
import OffersBrowse from "./OffersBrowse";
import OffersEditor from "./OffersEditor";
import { offerKey } from "../../utils/helpers";

export default function OffersSection() {
  const [tab, setTab] = useState("browse"); // 'browse' | 'edit'
  const [offer, setOffer] = useState(null);
  const [items, setItems] = useState([]);

  async function createDraft({ customer_id = null, currency = "BGN", vat_rate = 20, valid_until = "", notes_public = "", notes_internal = "" }) {
    const res = await api(`/offers`, {
      method: "POST",
      body: {
        customer_id,
        currency_code: currency,
        vat_rate,
        valid_until: valid_until || null,
        notes_public: notes_public || null,
        notes_internal: notes_internal || null
      }
    });
    return res.offer;
  }

  async function loadOffer(uuid) {
    const data = await api(`/offers/${uuid}`);
    setOffer(data.offer || null);
    setItems(data.items || []);
    setTab("edit");
  }

  return (
    <div className="contracts-wrap">
      <div className="toolbar tabs-bar">
        <div className="btn-row">
          <button className={"btn btn-ghost" + (tab === "browse" ? " btn-active" : "")} onClick={() => setTab("browse")}>Всички оферти</button>
          <button className={"btn btn-ghost" + (tab === "edit" ? " btn-active" : "")} onClick={() => setTab("edit")}>Нова / Редакция</button>
        </div>
      </div>

      {tab === "browse" && (
        <OffersBrowse
          onManage={async (uuid) => {
            await loadOffer(uuid);
          }}
        />
      )}

      {tab === "edit" && (
        <>
          {!offer ? (
            <div className="card">
              <div className="card-body">
                <h2 className="h2">Нова оферта</h2>
                <div className="text-muted" style={{ marginBottom: 8 }}>
                  Използвайте бутона по-долу за създаване на празна чернова и след това добавете автомобилите.
                </div>
                <div className="btn-row">
                  <button
                    className="btn btn-primary"
                    onClick={async () => {
                      try {
                        const o = await createDraft({});
                        await loadOffer(offerKey(o));
                      } catch (e) { alert(e.message); }
                    }}
                  >
                    Създай чернова
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <OffersEditor
              initialOffer={offer}
              initialItems={items}
              onExit={() => { setOffer(null); setItems([]); setTab("browse"); }}
              reloadOffer={loadOffer}
            />
          )}
        </>
      )}
    </div>
  );
}
