import React, { useEffect, useState } from 'react';
import Modal from '../Modal';
import {
    fetchVehicleContracts, fetchVehicleCoC, uploadVehicleCoC, fetchVehicleRegistration,
    uploadVehicleRegistrationCard, updateVehicleTransitNumber
} from '../../services/api';

export default function VehicleDocumentsModal({ open, onClose, vehicle }) {
    const [contracts, setContracts] = useState([]);
    const [cocFiles, setCocFiles] = useState({ en: null, bg: null, cn: null });
    const [registration, setRegistration] = useState({ transit_number: '', registration_card: null });
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('contracts'); // 'contracts' | 'coc' | 'registration'
    const [error, setError] = useState(null);

    const loadData = () => {
        if (!vehicle) return;
        setLoading(true);
        Promise.all([
            fetchVehicleContracts(vehicle.vehicle_id || vehicle.id),
            fetchVehicleCoC(vehicle.vehicle_id || vehicle.id),
            fetchVehicleRegistration(vehicle.vehicle_id || vehicle.id)
        ])
            .then(([contractsData, cocData, regData]) => {
                setContracts(contractsData);
                setCocFiles(cocData);
                setRegistration(regData || { transit_number: '', registration_card: null });
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (open && vehicle) {
            loadData();
        } else {
            setContracts([]);
            setCocFiles({ en: null, bg: null, cn: null });
            setRegistration({ transit_number: '', registration_card: null });
        }
    }, [open, vehicle]);

    const handleUploadCoC = async (lang, e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await uploadVehicleCoC(vehicle.vehicle_id || vehicle.id, lang, file);
            loadData();
        } catch (err) {
            alert('Upload failed: ' + err.message);
        }
    };

    const handleUploadRegistration = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            await uploadVehicleRegistrationCard(vehicle.vehicle_id || vehicle.id, file);
            loadData();
        } catch (err) {
            alert('Upload failed: ' + err.message);
        }
    };

    const handleSaveTransit = async () => {
        try {
            await updateVehicleTransitNumber(vehicle.vehicle_id || vehicle.id, registration.transit_number);
            alert('Запазено успешно!');
        } catch (err) {
            alert('Save failed: ' + err.message);
        }
    };

    const renderFileRow = (label, file, onUpload) => {
        return (
            <tr>
                <td>{label}</td>
                <td>
                    {file ? (
                        <div className="btn-row">
                            <a href={file.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-success">
                                Отвори
                            </a>
                        </div>
                    ) : (
                        <span className="text-muted">Липсва</span>
                    )}
                </td>
                <td>
                    <label className="btn btn-sm btn-secondary">
                        {file ? 'Подмени' : 'Качи'}
                        <input
                            type="file"
                            hidden
                            accept=".pdf,image/*"
                            onChange={onUpload}
                        />
                    </label>
                </td>
            </tr>
        );
    };

    const renderCocRow = (lang, label) => renderFileRow(label, cocFiles[lang], (e) => handleUploadCoC(lang, e));

    return (
        <Modal open={open} onClose={onClose} title={`Документи: ${vehicle?.make || ''} ${vehicle?.model || ''} ${vehicle?.year || ''} (${vehicle?.vin || ''})`}>
            {/* Tabs */}
            <div className="tabs-bar" style={{ marginBottom: 15, borderBottom: '1px solid #ddd' }}>
                <button
                    className={`tab ${activeTab === 'contracts' ? 'btn-active font-weight-bold' : ''}`}
                    onClick={() => setActiveTab('contracts')}
                >
                    Договори
                </button>
                <button
                    className={`tab ${activeTab === 'coc' ? 'btn-active font-weight-bold' : ''}`}
                    onClick={() => setActiveTab('coc')}
                >
                    Сертификати (CoC)
                </button>
                <button
                    className={`tab ${activeTab === 'registration' ? 'btn-active font-weight-bold' : ''}`}
                    onClick={() => setActiveTab('registration')}
                >
                    Талон и Транзит
                </button>
            </div>

            <div style={{ minHeight: 200 }}>
                {loading && <p>Зареждане...</p>}
                {error && <div className="alert alert-danger">{error}</div>}

                {!loading && !error && activeTab === 'contracts' && (
                    <>
                        {contracts.length === 0 ? (
                            <p className="text-muted">Няма свързани договори за този автомобил.</p>
                        ) : (
                            <table className="table table-tight">
                                <thead>
                                    <tr>
                                        <th>Договор</th>
                                        <th>Дата</th>
                                        <th>Статус</th>
                                        <th>Файлове</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {contracts.map(c => (
                                        <tr key={c.contract_id}>
                                            <td>
                                                <strong>#{c.contract_number || c.contract_id}</strong>
                                                <div className="text-muted small">{c.uuid}</div>
                                            </td>
                                            <td>{new Date(c.created_at).toLocaleDateString()}</td>
                                            <td>{c.status}</td>
                                            <td>
                                                <div className="btn-row">
                                                    {c.generated_pdf && (
                                                        <a
                                                            href={c.generated_pdf.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="btn btn-sm"
                                                            title={c.generated_pdf.filename}
                                                        >
                                                            Договор PDF (v{c.generated_pdf.version})
                                                        </a>
                                                    )}
                                                    {c.signed_pdf && (
                                                        <a
                                                            href={c.signed_pdf.url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="btn btn-sm btn-primary"
                                                            title={c.signed_pdf.filename}
                                                        >
                                                            Подписан договор PDF
                                                        </a>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </>
                )}

                {!loading && !error && activeTab === 'coc' && (
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Документ</th>
                                <th>Статус</th>
                                <th>Действие</th>
                            </tr>
                        </thead>
                        <tbody>
                            {renderCocRow('en', 'Удостоверение за съответствие (Английски)')}
                            {renderCocRow('bg', 'Удостоверение за съответствие (Български)')}
                            {renderCocRow('cn', 'Удостоверение за съответствие (Китайски)')}
                        </tbody>
                    </table>
                )}

                {!loading && !error && activeTab === 'registration' && (
                    <div>
                        <div style={{ marginBottom: 20, padding: 10, borderRadius: 4 }}>
                            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 5 }}>Транзитен номер</label>
                            <div style={{ display: 'flex', gap: 10 }}>
                                <input
                                    className="form-control input"
                                    style={{ flex: 1, maxWidth: 300 }}
                                    value={registration.transit_number || ''}
                                    onChange={(e) => setRegistration({ ...registration, transit_number: e.target.value })}
                                    placeholder="Въведи транзитен номер"
                                />
                                <button className="btn btn-primary" onClick={handleSaveTransit}>Запази</button>
                            </div>
                        </div>

                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Документ</th>
                                    <th>Статус</th>
                                    <th>Действие</th>
                                </tr>
                            </thead>
                            <tbody>
                                {renderFileRow('Талон на автомобила (Сканиран)', registration.registration_card, handleUploadRegistration)}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <div className="modal-footer">
                <button className="btn" onClick={onClose}>Затвори</button>
            </div>
        </Modal>
    );
}
