import React, { useEffect, useState } from 'react';
import Modal from '../Modal';
import { fetchVehicleContracts } from '../../services/api';

export default function VehicleDocumentsModal({ open, onClose, vehicle }) {
    const [contracts, setContracts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (open && vehicle) {
            setLoading(true);
            fetchVehicleContracts(vehicle.vehicle_id || vehicle.id)
                .then(setContracts)
                .catch(err => setError(err.message))
                .finally(() => setLoading(false));
        } else {
            setContracts([]);
        }
    }, [open, vehicle]);

    return (
        <Modal open={open} onClose={onClose} title={`Документи: ${vehicle?.make || ''} ${vehicle?.model || ''} ${vehicle?.year || ''} ${vehicle?.edition || ''} (${vehicle?.vin || ''})`}>
            <div style={{ minHeight: 200 }}>
                {loading && <p>Зареждане...</p>}
                {error && <div className="alert alert-danger">{error}</div>}

                {!loading && !error && contracts.length === 0 && (
                    <p className="text-muted">Няма свързани договори за този автомобил.</p>
                )}

                {!loading && contracts.length > 0 && (
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
                                                    PDF (v{c.generated_pdf.version})
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
                                                    Подписан PDF
                                                </a>
                                            )}
                                            {!c.generated_pdf && !c.signed_pdf && <span className="text-muted">-</span>}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="modal-footer">
                <button className="btn" onClick={onClose}>Затвори</button>
            </div>
        </Modal>
    );
}
