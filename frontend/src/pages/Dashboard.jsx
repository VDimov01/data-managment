import { useEffect, useState } from "react";
import CarsSection from "../components/editions/CarsSection";
import StorageSection from "../components/storage/StorageSection";
import ContractsSection from "../components/contracts/ContractsSection";
import BrochuresSection from "../components/brochures/BrochuresSection";
import CustomerSection from '../components/customers/CustomerSection';
import CompareSheetsSection from "../components/compares/CompareSheetsSection";
import { useAuth } from "../auth/AuthContext";
import { api } from "../services/api";


export default function Dashboard() {
  const firstname = localStorage.getItem("firstname");
  const lastname = localStorage.getItem("lastname");
  const [cars, setCars] = useState([]);
  const [activeTab, setActiveTab] = useState("Издания"); // cars | offers | storage
  const {user} = useAuth();
  const apiBase = "http://localhost:5000";

  const handleLogout = async () => {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = "/login";
  };

  return (
    <div className="dashboard-container">
      <h1>Добре дошъл, {user.name}!</h1>

      {/* Tab Buttons */}
      <div className="tab-buttons">
        {["Издания", "Склад", "Клиенти", "Договори", "Брошури", "Сравнения"].map((tab) => (
          <button
            key={tab}
            className={`tab-button ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Sections */}
      {activeTab === "Издания" && <CarsSection />}
      {/* {activeTab === "offers" && <OffersSection />} */}
      {activeTab === "Склад" && <StorageSection />}
      {activeTab === "Клиенти" && <CustomerSection />}
      {activeTab === "Договори" && <ContractsSection />}
      {activeTab === "Брошури" && <BrochuresSection />}
      {activeTab === "Сравнения" && <CompareSheetsSection apiBase={apiBase} />}

      {/* Logout Button */}

      <button className="logout-button" onClick={handleLogout}>
        Log out
      </button>
    </div>
  );
}
