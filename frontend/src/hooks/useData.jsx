import { useContext } from "react";
import { DataProvider } from "../contexts/DataContext";

export function useData() {
  return useContext(DataProvider);
}
