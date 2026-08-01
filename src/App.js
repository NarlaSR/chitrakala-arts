import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import ArtDetails from './pages/ArtDetails';
import RequestConfirmation from './pages/RequestConfirmation';
import About from './pages/About';
import Contact from './pages/Contact';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminAboutPage from './pages/AdminAboutPage';
import AdminContactPage from './pages/AdminContactPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import AdminCategoriesPage from './pages/AdminCategoriesPage';
import AdminInventorySync from './pages/AdminInventorySync';
import AdminReviewQueue from './pages/AdminReviewQueue';
import AdminOrderRequests from './pages/AdminOrderRequests';
import AdminShipments from './pages/AdminShipments';
import AdminCreateShipment from './pages/AdminCreateShipment';
import AdminShipmentDetail from './pages/AdminShipmentDetail';
import AdminPhysicalInventory from './pages/AdminPhysicalInventory';
import DebugEnv from './pages/DebugEnv';
import Maintenance from './pages/Maintenance';
import useMaintenanceMode from './hooks/useMaintenanceMode';
import './styles/App.css';

function PublicSite() {
  const { maintenanceMode, loading } = useMaintenanceMode();

  if (loading) return null;

  if (maintenanceMode) {
    return <Maintenance />;
  }

  return (
    <>
      <Header />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/category/:categoryId" element={<CategoryPage />} />
          <Route path="/art/:artId" element={<ArtDetails />} />
          <Route path="/request-confirmation" element={<RequestConfirmation />} />
          <Route path="/about" element={<About />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
      </main>
      <Footer />
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Admin Routes - Hidden paths for security. Never gated by maintenance mode. */}
            <Route path="/ckk-secure-admin" element={<AdminLogin />} />
            <Route path="/ckk-secure-admin/dashboard" element={<AdminDashboard />} />
            <Route path="/ckk-secure-admin/about" element={<AdminAboutPage />} />
            <Route path="/ckk-secure-admin/contact" element={<AdminContactPage />} />
            <Route path="/ckk-secure-admin/settings" element={<AdminSettingsPage />} />
            <Route path="/ckk-secure-admin/categories" element={<AdminCategoriesPage />} />
            <Route path="/ckk-secure-admin/inventory-sync" element={<AdminInventorySync />} />
            <Route path="/ckk-secure-admin/review-queue" element={<AdminReviewQueue />} />
            <Route path="/ckk-secure-admin/order-requests" element={<AdminOrderRequests />} />
            <Route path="/ckk-secure-admin/shipments" element={<AdminShipments />} />
            <Route path="/ckk-secure-admin/shipments/create" element={<AdminCreateShipment />} />
            <Route path="/ckk-secure-admin/shipments/:id" element={<AdminShipmentDetail />} />
            <Route path="/ckk-secure-admin/physical-inventory" element={<AdminPhysicalInventory />} />
            <Route path="/debug-env" element={<DebugEnv />} />

            {/* Public Routes - gated by maintenance mode */}
            <Route path="/*" element={<PublicSite />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
