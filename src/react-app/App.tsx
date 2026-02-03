import { BrowserRouter as Router, Routes, Route } from "react-router";
import { AuthProvider } from "@/react-app/contexts/AuthContext";
import HomePage from "@/react-app/pages/Home";
import LoginPage from "@/react-app/pages/Login";
import RegisterPage from "@/react-app/pages/Register";
import DashboardLayout from "@/react-app/components/DashboardLayout";
import DashboardPage from "@/react-app/pages/Dashboard";
import DashboardServicesPage from "@/react-app/pages/DashboardServices";
import DashboardSchedulesPage from "@/react-app/pages/DashboardSchedules";
import DashboardAppointmentsPage from "@/react-app/pages/DashboardAppointments";
import DashboardSettingsPage from "@/react-app/pages/DashboardSettings";
import PublicBookingPage from "@/react-app/pages/PublicBooking";
import AdminLoginPage from "@/react-app/pages/AdminLogin";
import AdminDashboardPage from "@/react-app/pages/AdminDashboard";

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin" element={<AdminLoginPage />} />
          <Route path="/admin/dashboard" element={<AdminDashboardPage />} />
          <Route path="/:slug" element={<PublicBookingPage />} />
          <Route path="/dashboard" element={<DashboardLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="services" element={<DashboardServicesPage />} />
            <Route path="schedules" element={<DashboardSchedulesPage />} />
            <Route path="appointments" element={<DashboardAppointmentsPage />} />
            <Route path="settings" element={<DashboardSettingsPage />} />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}
