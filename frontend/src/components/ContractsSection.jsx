import { useEffect, useState } from "react";
import { fetchStorage, fetchClients, fetchCompanies, searchContracts } from "../services/api";

export default function ContractSection() {
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [storage, setStorage] = useState([]);
  const [selectedBuyer, setSelectedBuyer] = useState({ type: "", buyer: null });
  const [selectedCars, setSelectedCars] = useState([]);
  const [previewUrl, setPreviewUrl] = useState("");

  // New state for contract type & advance amount
  const [contractType, setContractType] = useState("regular"); // "regular" or "advance"
  const [advanceAmount, setAdvanceAmount] = useState("");
    // Search state
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [results, setResults] = useState({ contracts: [], total: 0, page: 1, totalPages: 1 });
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetchClients().then(setClients);
    fetchCompanies().then(setCompanies);
    fetchStorage().then(setStorage);
  }, []);

    useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q.trim());
      setPage(1); // reset to first page when query changes
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  // Fetch search results
  useEffect(() => {
    (async () => {
      try {
        const data = await searchContracts(debouncedQ, page, 10);
        setResults(data);
      } catch (e) {
        console.error("Error fetching contracts:", e);
      }
    })();
  }, [debouncedQ, page]);

  const handleAddCar = (storageId) => {
    const exists = selectedCars.find((c) => c.storage_id === storageId);
    if (exists) return;
    setSelectedCars([...selectedCars, { storage_id: storageId, quantity: 1 }]);
  };

  const updateQuantity = (storageId, quantity) => {
    setSelectedCars((prev) =>
      prev.map((car) =>
        car.storage_id === storageId ? { ...car, quantity: Number(quantity) } : car
      )
    );
  };

  const removeCar = (storageId) => {
    setSelectedCars((prev) => prev.filter((car) => car.storage_id !== storageId));
  };

  const handleCreateContract = async () => {
    console.log(selectedBuyer.buyer);
    if (!selectedBuyer.buyer.uuid || selectedCars.length === 0) {
      return alert("Please select buyer and at least one car");
    }

    if (contractType === "advance" && (!advanceAmount || advanceAmount <= 0)) {
      return alert("Please enter a valid advance amount");
    }
    console.log(selectedBuyer);
    const res = await fetch("http://localhost:5000/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_uuid: selectedBuyer.type === "client" ? selectedBuyer.buyer.uuid : null,
        company_uuid: selectedBuyer.type === "company" ? selectedBuyer.buyer.uuid : null,
        cars: selectedCars,
        contract_type: contractType,
        advance_amount: contractType === "advance" ? advanceAmount : null
      }),
    });

    const data = await res.json();
    if (data.previewUrl) {
      setPreviewUrl(data.previewUrl);
      setSelectedCars([]);
      setAdvanceAmount("");
      setContractType("regular");
      fetchStorage().then(setStorage);
      searchContracts(debouncedQ, 1, 10).then(setResults);
    }
  };

  return (
    <div className="contract-section">
      <h2>Генериране на договор за покупко-продажба</h2>

      {/* Buyer Selection */}
      <div className="form-group">
        <label>Избери купувач:</label>
        <select onChange={(e) => {
          const [type, id] = e.target.value.split("-");
          if (type === "client") {
        const buyerObj = clients.find((c) => c.id === Number(id));
        setSelectedBuyer({ type, buyer: buyerObj });
      } else if (type === "company") {
        const buyerObj = companies.find((c) => c.id === Number(id));
        setSelectedBuyer({ type, buyer: buyerObj });
      } else {
        setSelectedBuyer({ type: "", buyer: null });
      }
        }}>
          <option value="">-- Избери купувач --</option>
          <optgroup label="Индивидуални клиенти">
            {clients.map(c => (
              <option key={`c-${c.id}`} value={`client-${c.id}`}>
                {c.first_name} {c.last_name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Фирми">
            {companies.map(c => (
              <option key={`co-${c.id}`} value={`company-${c.id}`}>
                {c.name}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      {/* Contract Type Selection */}
      <div className="form-group">
        <label>Тип на договора:</label>
        <select value={contractType} onChange={(e) => setContractType(e.target.value)}>
          <option value="regular">Договор за директна продажба</option>
          <option value="advance">Договор с авансово плащане</option>
        </select>
      </div>

      {/* Advance Payment Input (only if selected) */}
      {contractType === "advance" && (
        <div className="form-group">
          <label>Сума на авансовото плащане:</label>
          <input
            type="number"
            min="1"
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            placeholder="Въведи сума на авансовото плащане"
          />
        </div>
      )}

      {/* Car Selection */}
      <div className="form-group">
        <label>Добави автомобил от наличност:</label>
        <select onChange={(e) => {
          if (e.target.value) handleAddCar(Number(e.target.value));
        }}>
          <option value="">-- Избери автомобил --</option>
          {storage.map(car => (
            <option key={car.id} value={car.id}>
              {car.maker} {car.model} {car.edition || ""} ({car.color}/{car.second_color || ""}) - {car.price} лв - Qty: {car.quantity}
            </option>
          ))}
        </select>
      </div>

      {/* Selected Cars */}
      {selectedCars.length > 0 && (
        <div className="selected-cars-list">
          <h4>Избрани автомобили</h4>
          {selectedCars.map(({ storage_id, quantity }) => {
            const car = storage.find(c => c.id === storage_id);
            return (
              <div key={storage_id} className="selected-car-row">
                <span>
                  {car?.maker} {car?.model} {car?.edition || ""} ({car?.color}) - {car?.price} лв
                </span>
                <input
                  type="number"
                  min="1"
                  max={car?.quantity}
                  value={quantity}
                  onChange={(e) => updateQuantity(storage_id, e.target.value)}
                />
                <button onClick={() => removeCar(storage_id)}>Премахни</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Submit */}
      <button className="submit-button" onClick={handleCreateContract}>
        Генерирай договор
      </button>

      {/* Preview */}
      {previewUrl && (
        <div className="contract-preview">
          <h4>Преглед на договора:</h4>
          <a href={`http://localhost:5000${previewUrl}`} target="_blank" rel="noreferrer">
            Прегледай PDF
          </a>
        </div>
      )}
      
      <hr style={{ margin: "24px 0" }} />

      {/* ------- Search Contracts ------- */}
      <h3>Search Contracts</h3>

      <div className="form-group">
        <input
          type="text"
          placeholder="Search by client name, email, or company name..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className="contracts-results">
        {results.contracts.length === 0 ? (
          <p>No contracts found.</p>
        ) : (
          <ul className="contracts-list">
            {results.contracts.map((c) => (
              <li key={c.uuid} className="contracts-list-item">
                <div>
                  <strong>{c.client_uuid !== null ? `${c.first_name} ${c.last_name}` : c.company_name}</strong>{" "}
                  <span style={{ opacity: 0.7 }}>({c.client_uuid !== null ? "Индивидуален клиент" : "Фирма"})</span>
                </div>
                <div>
                  {new Date(c.created_at).toLocaleString("bg-BG")} — {c.contract_type === "advance" ? `Авансово плащане - ${c.advance_amount} лв` : "Обикновен"}
                </div>
                <div>
                  <a
                    href={`http://localhost:5000/${c.pdf_path}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Preview PDF
                  </a>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Pagination */}
        {results.totalPages > 1 && (
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </button>
            <span>
              Page {results.page} of {results.totalPages}
            </span>
            <button
              disabled={results.page >= results.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </div>

    </div>
  );
}
