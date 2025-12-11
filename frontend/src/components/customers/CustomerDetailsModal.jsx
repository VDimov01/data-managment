import { useState, useEffect } from "react";
import { Offers } from "../../services/offers";
import { searchContracts, api, API_BASE } from "../../services/api";
import { statusToBG } from "../../utils/i18n";

export default function CustomerDetailsModal({ customer }) {
    const [activeTab, setActiveTab] = useState("info");
    const [offers, setOffers] = useState([]);
    const [contracts, setContracts] = useState([]);
    const [loadingOffers, setLoadingOffers] = useState(false);
    const [loadingContracts, setLoadingContracts] = useState(false);

    useEffect(() => {
        if (activeTab === "offers") {
            if (customer?.public_uuid) {
                loadOffers();
            } else {
                console.warn("Офертите не могат да бъдат заредени: Липсва public_uuid", customer);
            }
        } else if (activeTab === "contracts" && customer?.customer_id) {
            loadContracts();
        }
    }, [activeTab, customer]);

    const loadOffers = async () => {
        setLoadingOffers(true);
        try {
            const res = await Offers.list({ clientUuid: customer.public_uuid, limit: 100 });
            setOffers(res || []);
        } catch (err) {
            console.error("Неуспешно зареждане на оферти", err);
        } finally {
            setLoadingOffers(false);
        }
    };

    const loadContracts = async () => {
        setLoadingContracts(true);
        try {
            const res = await searchContracts("", 1, 100, customer.customer_id);
            setContracts(res.items || []);
        } catch (err) {
            console.error("Неуспешно зареждане на договорите", err);
        } finally {
            setLoadingContracts(false);
        }
    };

    const handleOpenContractDraft = async (c) => {
        try {
            // Fetch the latest PDF info using the UUID
            const res = await api(`/contracts/${c.uuid}/pdf/latest`);
            if (res && res.signedUrl) {
                window.open(res.signedUrl, '_blank');
            } else {
                alert(`Договорът няма PDF файл. Може да е нов договор, който все още не е генериран.
                    Отиди в секция Договори и регенерирай договора със следния номер ${c.contract_number}`);
            }
        } catch (err) {
            console.error("Неуспешно отваряне на договор PDF", err);
            // Fallback (optional) or user alert
            if (err.status === 404) {
                alert(`Договорът няма PDF файл. Може да е нов договор, който все още не е генериран.
                    Отиди в секция Договори и регенерирай договора със следния номер ${c.contract_number}`);
            } else {
                alert("Неуспешно отваряне на договор PDF.");
            }
        }
    };

    const handleOpenSignedContract = (c) => {
        if (c.signed_pdf?.url) {
            window.open(c.signed_pdf.url, '_blank');
        }
    };

    const handleOpenOffer = async (o) => {
        try {
            const res = await api(`/offers/${o.offer_uuid}/pdf/latest`);
            if (res && res.signedUrl) {
                window.open(res.signedUrl, '_blank');
            } else {
                alert(`Офертата няма PDF файл. Може да е нова оферта, която все още не е генерирана.
                    Отиди в секция Оферти и регенерирай офертата със следния номер ${o.offer_number}`);
            }
        } catch (err) {
            console.error("Неуспешно отваряне на оферта PDF", err);
            alert("Неуспешно отваряне на оферта PDF.");
        }
    };

    const getBadgeClass = (status) => {
        const s = (status || '').toLowerCase();
        if (['signed', 'converted', 'issued'].includes(s)) return 'cdm-badge-active';
        if (['withdrawn', 'expired', 'cancelled'].includes(s)) return 'cdm-badge-withdrawn';
        return 'cdm-badge-draft';
    };

    const InfoTab = () => (
        <div className="cdm-grid">
            <div className="cdm-group">
                <label className="cdm-label">Име / Компания</label>
                <div className="cdm-value">{customer.display_name || customer.company_name || `${customer.first_name} ${customer.last_name}`}</div>
            </div>
            <div className="cdm-group">
                <label className="cdm-label">Email</label>
                <div className="cdm-value">{customer.email || "—"}</div>
            </div>
            <div className="cdm-group">
                <label className="cdm-label">Телефон</label>
                <div className="cdm-value">{customer.phone || "—"}</div>
            </div>
            <div className="cdm-group">
                <label className="cdm-label">Град</label>
                <div className="cdm-value">{customer.city || "—"}</div>
            </div>
            <div className="cdm-group">
                <label className="cdm-label">Адрес</label>
                <div className="cdm-value">{customer.address_line || "—"}</div>
            </div>
            {customer.customer_type === "Company" && (
                <>
                    <div className="cdm-group">
                        <label className="cdm-label">ЕИК / ДДС</label>
                        <div className="cdm-value">{customer.vat_number || "—"}</div>
                    </div>
                    <div className="cdm-group">
                        <label className="cdm-label">МОЛ</label>
                        <div className="cdm-value">{`${customer.rep_first_name || ""} ${customer.rep_last_name || ""}`.trim() || "—"}</div>
                    </div>
                </>
            )}
            {customer.customer_type === "Individual" && (
                <div className="cdm-group">
                    <label className="cdm-label">ЕГН</label>
                    <div className="cdm-value">{customer.national_id || "**********"}</div>
                </div>
            )}
            <div className="cdm-group cdm-full">
                <label className="cdm-label">Бележки</label>
                <div className="cdm-notes">{customer.notes || "Няма бележки"}</div>
            </div>
        </div>
    );

    const OffersTab = () => (
        <div className="tab-content">
            {loadingOffers && <div className="cdm-loading">Зареждане на оферти...</div>}
            {!loadingOffers && offers.length === 0 && <div className="cdm-empty">Няма намерени оферти.</div>}
            {!loadingOffers && offers.length > 0 && (
                <div className="table-wrap">
                    <table className="table table-sm">
                        <thead>
                            <tr>
                                <th>Дата</th>
                                <th>Валидна до</th>
                                <th>Оферта ID</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {offers.map(o => (
                                <tr key={o.uuid}>
                                    <td>{new Date(o.created_at).toLocaleDateString("bg-BG")}</td>
                                    <td>{o.valid_until ? new Date(o.valid_until).toLocaleDateString("bg-BG") : "—"}</td>
                                    <td className="mono" title={o.uuid}>
                                        {o.offer_uuid.slice(0, 8)}...
                                    </td>
                                    <td><span className={getBadgeClass(o.status)}>{statusToBG(o.status)}</span></td>
                                    <td>
                                        <button className="btn btn-sm" onClick={() => handleOpenOffer(o)}>
                                            Преглед
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    const ContractsTab = () => (
        <div className="tab-content">
            {loadingContracts && <div className="cdm-loading">Зареждане на договори...</div>}
            {!loadingContracts && contracts.length === 0 && <div className="cdm-empty">Няма намерени договори.</div>}
            {!loadingContracts && contracts.length > 0 && (
                <div className="table-wrap">
                    <table className="table table-sm">
                        <thead>
                            <tr>
                                <th>Номер</th>
                                <th>Дата</th>
                                <th>Сума</th>
                                <th>Статус</th>
                                <th>Действия</th>
                            </tr>
                        </thead>
                        <tbody>
                            {contracts.map(c => (
                                <tr key={c.contract_id}>
                                    <td className="mono">{c.contract_number}</td>
                                    <td>{new Date(c.created_at).toLocaleDateString("bg-BG")}</td>
                                    <td>{c.total} {c.currency_code}</td>
                                    <td><span className={getBadgeClass(c.status)}>{statusToBG(c.status)}</span></td>
                                    <td>
                                        <div className="cdm-actions">
                                            <button className="btn btn-sm" onClick={() => handleOpenContractDraft(c)}>
                                                Преглед
                                            </button>
                                            {c.signed_pdf?.url && (
                                                <button className="btn btn-sm btn-success" onClick={() => handleOpenSignedContract(c)}>
                                                    Подписан
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );

    return (
        <div className="cdm-root">
            <div className="cdm-tabs">
                <button className={`cdm-tab ${activeTab === "info" ? "active" : ""}`} onClick={() => setActiveTab("info")}>Информация</button>
                <button className={`cdm-tab ${activeTab === "offers" ? "active" : ""}`} onClick={() => setActiveTab("offers")}>Оферти</button>
                <button className={`cdm-tab ${activeTab === "contracts" ? "active" : ""}`} onClick={() => setActiveTab("contracts")}>Договори</button>
            </div>
            <div className="cdm-scroll">
                {activeTab === "info" && <InfoTab />}
                {activeTab === "offers" && <OffersTab />}
                {activeTab === "contracts" && <ContractsTab />}
            </div>
        </div>
    );
}
