import { createContext, useState, useEffect } from "react";


const DataContext = createContext();

export function DataProvider({ children }) {

  return (
    <DataContext.Provider value={{}}>
      {children}
    </DataContext.Provider>
  );
}

