import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './ProtectedRoute';
import { DataProvider } from './contexts/DataContext';
import { AuthProvider } from './auth/AuthContext';
import CustomerPortal from './pages/CustomerPortal'
import VehiclePublicPage from './pages/VehiclePublicPage';
import {API_BASE} from './services/api.js';

function App() {
  const isLoggedIn = !!localStorage.getItem('token');
  const apiBase = API_BASE;

  return (
      <AuthProvider>
    <Routes>
      <Route path="/customer/:uuid" element={<CustomerPortal apiBase={apiBase}/>} />
      <Route path="/vehicles/:uuid" element={<VehiclePublicPage apiBase={import.meta.env.VITE_API_BASE || "http://localhost:5000"} />} />
        <Route path="/" element={<Navigate to={isLoggedIn ? "/dashboard" : "/login"} />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard"
          element={<ProtectedRoute><DataProvider><Dashboard /></DataProvider></ProtectedRoute>}
          />
    </Routes>
      </AuthProvider>
  );
}

export default App;
