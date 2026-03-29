import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AppLayout from './components/layout/AppLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import WorkManagement from './pages/WorkManagement';
import Assignments from './pages/Assignments';
import AvailabilityRequests from './pages/AvailabilityRequests';
import UserManagement from './pages/UserManagement';
import PdfImport from './pages/PdfImport';
import PersonManagement from './pages/PersonManagement';
import MyWork from './pages/MyWork';
import RequestAvailability from './pages/RequestAvailability';

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <ToastProvider>
          <Routes>
            {/* Public */}
            <Route path="/login" element={<Login />} />

            {/* Protected - App Layout */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <AppLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />

              {/* Admin routes */}
              <Route
                path="works"
                element={
                  <ProtectedRoute adminOnly>
                    <WorkManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="assignments"
                element={
                  <ProtectedRoute adminOnly>
                    <Assignments />
                  </ProtectedRoute>
                }
              />
              <Route
                path="requests"
                element={
                  <ProtectedRoute adminOnly>
                    <AvailabilityRequests />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute adminOnly>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="pdf-import"
                element={
                  <ProtectedRoute adminOnly>
                    <PdfImport />
                  </ProtectedRoute>
                }
              />
              <Route
                path="persons"
                element={
                  <ProtectedRoute adminOnly>
                    <PersonManagement />
                  </ProtectedRoute>
                }
              />

              {/* User routes */}
              <Route path="my-work" element={<MyWork />} />
              <Route path="request-availability" element={<RequestAvailability />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </HashRouter>
  );
}
