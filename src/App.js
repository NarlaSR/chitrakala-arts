import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Header';
import Footer from './components/Footer';
import Home from './pages/Home';
import CategoryPage from './pages/CategoryPage';
import ArtDetails from './pages/ArtDetails';
import About from './pages/About';
import Contact from './pages/Contact';
import AdminLogin from './pages/AdminLogin';
import AdminDashboard from './pages/AdminDashboard';
import AdminAboutPage from './pages/AdminAboutPage';
import AdminContactPage from './pages/AdminContactPage';
import AdminSettingsPage from './pages/AdminSettingsPage';
import './styles/App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Admin Routes - Hidden paths for security */}
            <Route path="/ckk-secure-admin" element={<AdminLogin />} />
            <Route path="/ckk-secure-admin/dashboard" element={<AdminDashboard />} />
            <Route path="/ckk-secure-admin/about" element={<AdminAboutPage />} />
            <Route path="/ckk-secure-admin/contact" element={<AdminContactPage />} />
            <Route path="/ckk-secure-admin/settings" element={<AdminSettingsPage />} />
            
            {/* Public Routes */}
            <Route path="/*" element={
              <>
                <Header />
                <main className="main-content">
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/category/:categoryId" element={<CategoryPage />} />
                    <Route path="/art/:artId" element={<ArtDetails />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                  </Routes>
                </main>
                <Footer />
              </>
            } />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
