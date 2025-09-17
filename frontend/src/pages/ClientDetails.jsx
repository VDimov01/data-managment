import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { fetchImages } from "../services/api";
import React from "react";


export default function ClientDetails() {
  const fieldGroups = {
  "Основна информация": [
    "maker",
    "model",
    "edition",
    "production_date",
    "car_price_bgn",
    "car_price_eur",
    "mileage_km",
    "car_type",
    "fuel_type",
    "euro_standard",
    "passenger_capacity"
  ],
  "Двигател и трансмисия": [
    "engine",
    "ice_engine_model",
    "ice_displacement_cm3",
    "ice_max_power_hp",
    "ice_max_power_kw",
    "ice_max_torque_nm",
    "ice_max_power_rpm",
    "ice_max_torque_rpm",
    "ice_thermal_efficiency_percent",
    "cylinder_count",
    "valves_per_cylinder",
    "ice_engine_type",
    "transmission",
    "cylinder_block_material",
    "fuel_injection_type"
  ],
  "Безопасност и системи": [
    "abs",
    "ebd",
    "esp",
    "front_airbags",
    "side_airbags",
    "rear_airbags",
    "adaptive_headlights"
  ],
  "Електрически компоненти": [
    "ev_max_power_hp",
    "ev_max_power_kw",
    "ev_max_torque_nm",
    "battery_capacity_kwh",
    "battery_type",
    "battery_cooling_system",
    "electric_range_cltc_km",
    "electric_range_wltc_km"
  ],
  "Размери и производителност": [
    "length_mm",
    "width_mm",
    "height_mm",
    "max_speed_kmh",
    "acceleration_0_100_s",
    "fuel_consumption_wltc",
    "turning_radius_m",
    "fuel_tank_volume_l"
  ],
  "Шаси и кормилна система": [
    "drive_type",
    "front_suspension_type",
    "rear_suspension_type",
    "steering_type"
  ],
  "Колела и спирачки": [
    "front_tire_size",
    "rear_tire_size",
    "spare_tire_size",
    "brake_type_front",
    "brake_type_rear",
    "handbrake_type"
  ]
};

const featureLabelsBG = {
    maker: "Марка",
    model: "Модел",
    edition: "Издание",
    production_date: "Дата на производство",
    car_price_bgn: "Цена (BGN с ДДС)",
    car_price_eur: "Цена (EUR с ДДС)",
    mileage_km: "Пробег (км)",
    car_type: "Тип на автомобила",
    passenger_capacity: "Брой пътници",
    engine: "Двигател",
    ice_engine_model: "Модел на ДВГ",
    power_hp: "Обща мощност (к.с.)",
    ice_displacement_cm3: "Кубатура на ДВГ (куб.см)",
    ice_max_power_hp: "Макс. мощност ДВГ (к.с.)",
    ice_max_power_kw: "Макс. мощност ДВГ (kW)",
    ice_max_torque_nm: "Макс. въртящ момент ДВГ (Nm)",
    ice_max_power_rpm: "Обороти на ДВГ на максимална мощност (rpm)",
    ice_max_torque_rpm: "Обороти на ДВГ на максимален въртящ момент (rpm)",
    ice_thermal_efficiency_percent: "Термичен КПД на ДВГ (%)",
    cylinder_count: "Брой цилиндри",
    valves_per_cylinder: "Клапани на цилиндър",
    ice_engine_type: "Тип на двигателя",
    fuel_type: "Вид гориво",
    transmission: "Скоростна кутия",
    euro_standard: "Евростандарт",
    ev_max_power_hp: "Макс. мощност електродвигател (к.с.)",
    ev_max_power_kw: "Макс. мощност електродвигател (kW)",
    ev_max_torque_nm: "Макс. въртящ момент електродвигател (Nm)",
    battery_capacity_kwh: "Капацитет на батерията (kWh)",
    battery_type: "Тип батерия",
    battery_cooling_system: "Система за охлаждане на батерията",
    electric_range_cltc_km: "Пробег електрически (CLTC, км)",
    electric_range_wltc_km: "Пробег електрически (WLTC, км)",
    length_mm: "Дължина (мм)",
    width_mm: "Ширина (мм)",
    height_mm: "Височина (мм)",
    max_speed_kmh: "Макс. скорост (км/ч)",
    acceleration_0_100_s: "Ускорение 0-100 км/ч (с)",
    fuel_consumption_wltc: "Разход WLTC (л/100км)",
    turning_radius_m: "Радиус на завиване (м)",
    fuel_tank_volume_l: "Обем на резервоара (л)",
    adaptive_headlights: "Адаптивни предни светлини",
    abs: "Антиблокираща система (ABS)",
    rear_airbags: "Задни въздушни възглавници",
    front_airbags: "Предни въздушни възглавници",
    side_airbags: "Странични въздушни възглавници",
    ebd: "EBD – електронно разпределение на спирачната сила",
    esp: "ESP – електронна програма за стабилизиране",
    fuel_injection_type: "Тип впръскване",
  cylinder_block_material: "Материал на цилиндровия блок",
  drive_type: "Тип на задвижване",
  front_suspension_type: "Предно окачване",
  rear_suspension_type: "Задно окачване",
  steering_type: "Тип кормилна система",
  brake_type_front: "Предни спирачки",
  brake_type_rear: "Задни спирачки",
  handbrake_type: "Тип ръчна спирачка",
  front_tire_size: "Размери на предните гуми",
  rear_tire_size: "Размери на задните гуми",
  spare_tire_size: "Размер на резервната гума"
};

  const { type, uuid } = useParams();
  const [client, setClient] = useState(null);
  const [offers, setOffers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [brochures, setBrochures] = useState([]);
  const [visibleBrochures, setVisibleBrochures] = useState({});
  const [modalImages, setModalImages] = useState([]);
  const [modalIndex, setModalIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

const toggleBrochure = (idx) => {
    setVisibleBrochures((prev) => ({
      ...prev,
      [idx]: !prev[idx],
    }));
  };

  const formatValue = (value) => {
      if (value === 1 || value === true) return "✅";
      if (value === 0 || value === false) return "❌";
      if (!value) return "-";
      if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
        return new Date(value).toISOString().split("T")[0];
      }
      return value;
    };
  
    const [images, setImages] = useState([]);
  
    const fetchImagesData = async (carId, carMaker, carModel) => {
      try {
        const data = await fetchImages(carId, carMaker, carModel);
        setImages(data.images);
      } catch (error) {
        console.error("Error fetching images:", error);
      }
    };

  useEffect(() => {
    const fetchAll = async () => {
      try {
        // fetch client
        const clientRes = await fetch(`http://localhost:5000/api/clients/uuid/${uuid}`);
        if (!clientRes.ok) throw new Error("Failed to fetch client");
        const clientData = await clientRes.json();
        setClient(clientData);

        // fetch offers
        const offersRes = await fetch(`http://localhost:5000/api/clients/uuid/${uuid}/offers`);
        const offersData = await offersRes.json();
        setOffers(offersData);

        // fetch contracts
        const contractsRes = await fetch(`http://localhost:5000/api/clients/uuid/${uuid}/contracts`);
        const contractsData = await contractsRes.json();
        setContracts(contractsData);

        // fetch brochures
        const brochuresRes = await fetch(`http://localhost:5000/api/brochures/client-brochures?clientUuid=${uuid}&type=${type}`);
        if (!brochuresRes.ok) throw new Error("Failed to fetch brochures");
        const brochuresData = await brochuresRes.json();
        setBrochures(brochuresData);

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchAll();
  }, [uuid]);

  useEffect(() => {
      brochures.forEach((b) => {
        fetchImagesData(b.editions[0].id, b.editions[0].maker, b.editions[0].model);
      });
    }, [brochures]);

  if (loading) return <p>Зареждане...</p>;
  if (error) return <p>Грешка: {error}</p>;
  if (!client) return <p>Няма намерен клиент.</p>;

  return (
    <div style={{ padding: "20px" }}>
      <h2>Детайли за клиент</h2>
      <p><strong>Име:</strong> {client.first_name} {client.middle_name || ""} {client.last_name}</p>
      <p><strong>Email:</strong> {client.email}</p>
      <p><strong>Телефон:</strong> {client.phone_number || "-"}</p>
      <hr />

      <h3>Оферти</h3>
      {offers.length === 0 ? (
        <p>Няма оферти за този клиент.</p>
      ) : (
        <ul>
          {offers.map((o) => (
            <li key={o.id}>
              <strong>{o.contract_type}</strong> – {new Date(o.created_at).toLocaleDateString()}  
              {" "} <a href={`http://localhost:5000/${o.pdf_path}`} target="_blank" rel="noopener noreferrer">PDF</a>
            </li>
          ))}
        </ul>
      )}

      <h3>Договори</h3>
      {contracts.length === 0 ? (
        <p>Няма договори за този клиент.</p>
      ) : (
        <ul>
          {contracts.map((c) => (
            <li key={c.id}>
              <strong>{c.contract_type === "advance" ? `Договор с авансово плащане - Авансово плащане: ${c.advance_amount}лв.` :`Договор с директна продажба`}</strong> – {new Date(c.created_at).toLocaleDateString()}  
              {" "} <a href={`http://localhost:5000/${c.pdf_path}`} target="_blank" rel="noopener noreferrer">PDF</a>
            </li>
          ))}
        </ul>
      )}

      <h3>Брошури</h3>
      {brochures.length === 0 ? (
        <p>Няма брошури за този клиент.</p>
      ) : (
        <div className="brochure-buttons">
          {brochures.map((b, idx) => (
            <button key={idx} onClick={() => toggleBrochure(idx)}>
              {visibleBrochures[idx] ? "Hide" : "Show"} {b.maker} {b.model}
            </button>
          ))}
        </div>
      )}


      {brochures.map((b, idx) =>
        visibleBrochures[idx] ? (
          <div key={idx} className="brochure-card">
            
      
              <div className="brochure-header">
                  <img src={images[0].image_url} alt={`${b.maker} ${b.model}`} className="brochure-image" />
                  <h3>{b.maker} {b.model}</h3>
              </div>
            
            <div className="brochure-content">
        <div className="brochure-nav">
          <ul>
            {Object.keys(fieldGroups).map((groupName) => (
              <li key={groupName}>
                <a href={`#${groupName.replace(/\s+/g, "-").toLowerCase()}`}>
                  {groupName}
                </a>
              </li>
            ))}
          </ul>
        </div>
      
            <div className="comparison-scroll">
              <table className="comparison-table">
                <thead>
                  <tr>
                    <th>Field</th>
                    {b.editions.map((e, i) => (
                      <th key={i}>{e.edition || `Edition ${i + 1}`}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
        {Object.entries(fieldGroups).map(([groupName, fields]) => (
          <React.Fragment key={groupName}>
            <tr className="group-header" id={groupName.replace(/\s+/g, "-").toLowerCase()}>
              <td colSpan={b.editions.length + 1}><strong>{groupName}</strong></td>
            </tr>
            {fields.map((field) => (
              <tr key={field}>
                <td><strong>{featureLabelsBG[field] || field.replace(/_/g, " ")}</strong></td>
                {b.editions.map((e, i) => (
                  <td key={i}>{formatValue(e[field])}</td>
                ))}
              </tr>
            ))}
          </React.Fragment>
        ))}
      </tbody>
      
              </table>
              {/* Exterior Images Section */}
      <div className="image-section">
        <h4>Външни снимки (Exterior):</h4>
        <div className="image-gallery">
          {images
        .filter((img) => img.part === "exterior")
        .map((img, index, arr) => (
          <img
            key={img.id}
            src={img.image_url}
            alt={`${b.maker} ${b.model} exterior`}
            className="car-image"
            onClick={() => {
              const filtered = arr.filter(i => i.part === "exterior");
              setModalImages(filtered);
              setModalIndex(index);
            }}
          />
        ))}
      
        </div>
      </div>
      
      {/* Interior Images Section */}
      <div className="image-section">
        <h4>Вътрешни снимки (Interior):</h4>
        <div className="image-gallery">
          {images
        .filter((img) => img.part === "interior")
        .map((img, index, arr) => (
          <img
            key={img.id}
            src={img.image_url}
            alt={`${b.maker} ${b.model} interior`}
            className="car-image"
            onClick={() => {
              const filtered = arr.filter(i => i.part === "interior");
              setModalImages(filtered);
              setModalIndex(index);
            }}
          />
        ))}
      
        </div>
      </div>
      
      
        </div>
      
            </div>
            {modalIndex !== null && (
        <div className="image-modal" onClick={() => setModalIndex(null)}>
          <div className="image-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="image-wrapper">
      
            <button
              className="modal-arrow left"
              onClick={() => {
                setModalIndex((prev) =>
                  prev === 0 ? modalImages.length - 1 : prev - 1
              );
            }}
            >
              &#8592;
            </button>
      
            <img src={modalImages[modalIndex]?.image_url} alt="Car full" />
      
            <button
              className="modal-arrow right"
              onClick={() => {
                setModalIndex((prev) =>
                  prev === modalImages.length - 1 ? 0 : prev + 1
              );
            }}
            >
              &#8594;
            </button>
            </div>
      
            <button className="modal-close" onClick={() => setModalIndex(null)}>×</button>
          </div>
        </div>
      )}
      
      
          </div>
        ) : null
      )}
    </div>
  );
}
