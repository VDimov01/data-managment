import { createContext, useState, useEffect } from "react";
import { fetchClients, fetchCompanies } from "../services/api";

const DataContext = createContext();

export function DataProvider({ children }) {
  const [clients, setClients] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [offers, setOffers] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setClients(await fetchClients());
        setCompanies(await fetchCompanies());
      } catch (err) {
        console.error("Failed to fetch data:", err);
      }
    })();
  }, []);

  return (
    <DataContext.Provider value={{ clients, setClients, companies, setCompanies }}>
      {children}
    </DataContext.Provider>
  );
}

