import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './ProtectedRoute';
import { DataProvider } from './contexts/DataContext';
import CustomerPortal from './pages/CustomerPortal'

function App() {
  const isLoggedIn = !!localStorage.getItem('token');

  return (
    <Routes>
      <Route path="/" element={<Navigate to={isLoggedIn ? "/dashboard" : "/login"} />} />
      <Route path="/login" element={<Login />} />
      {/* <Route path="/customers/:type/:uuid" element={<ClientDetails />} /> */}
      <Route path="/customer/:uuid" element={<CustomerPortal apiBase="http://localhost:5000"/>} />
      <Route
        path="/dashboard"
        element={<ProtectedRoute><DataProvider><Dashboard /></DataProvider></ProtectedRoute>}
      />
    </Routes>
  );
}

export default App;
