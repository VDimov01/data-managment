import { useState, useEffect, useMemo } from "react";
import CarCardCompareView from "../components/CarCardCompareView";
import CarComparison from "../components/CarComparison";

export default function CompareView() {
  const [cars, setCars] = useState([]);
  const [selectedCars, setSelectedCars] = useState([]);
  const [showComparison, setShowComparison] = useState(false);

  useEffect(() => {
    fetch("http://localhost:5000/api/cars?limit=100")
      .then((res) => res.json())
      .then((data) => setCars(data.cars || []))
      .catch((err) => console.error("Error fetching cars:", err));
  }, []);

  const groupedCars = useMemo(() => {
    const map = {};
    cars.forEach((car) => {
      const key = `${car.maker} ${car.model}`;
      if (!map[key]) map[key] = [];
      map[key].push(car);
    });
    return Object.entries(map).map(([modelName, editions]) => ({
      modelName,
      editions
    }));
  }, [cars]);

  const toggleSelectCar = (car) => {
    setSelectedCars((prev) =>
      prev.some((c) => c.id === car.id)
        ? prev.filter((c) => c.id !== car.id)
        : [...prev, car]
    );
  };

  return (
    <div className="compare-view">
      <h1 className="compare-title">Car Catalog</h1>

      {!showComparison && (
        <div className="catalog-layout">
          <div className="catalog-section">
            <div className="catalog-grid">
              {groupedCars.map(({ modelName, editions }) => (
                <CarCardCompareView
                  key={modelName}
                  modelName={modelName}
                  editions={editions}
                  onSelectCar={toggleSelectCar}
                  selectedCars={selectedCars}
                />
              ))}
            </div>
          </div>

          <div className="sticky-compare-panel">
            <h3>Selected Cars</h3>
            {selectedCars.length === 0 ? (
              <p className="empty-msg">No cars selected</p>
            ) : (
              <ul>
                {selectedCars.map((c) => (
                  <li key={c.id}>
                    {c.maker} {c.model} {c.edition || ""}
                  </li>
                ))}
              </ul>
            )}
            <button
              className="compare-button"
              onClick={() => setShowComparison(true)}
              disabled={selectedCars.length < 2}
            >
              Compare Selected Cars
            </button>
            <button className="clear-button" onClick={() => setSelectedCars([])} disabled={selectedCars.length === 0}>
              Clear Selection
            </button>
          </div>
        </div>
      )}

      {showComparison && (
        <div className="comparison-section">
          <h2>Car Comparison</h2>
          <CarComparison selectedCars={selectedCars} />
          <button
            className="back-button"
            onClick={() => setShowComparison(false)}
          >
            Back to Catalog
          </button>
        </div>
      )}
    </div>
  );
}
