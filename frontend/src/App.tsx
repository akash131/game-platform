import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Dashboard } from './pages/Dashboard';
import { Matchmaking } from './pages/Matchmaking';
import { Profile } from './pages/Profile';
import { Store } from './pages/Store';
import { Leaderboard } from './pages/Leaderboard';
import { Social } from './pages/Social';
import { DeveloperPortal } from './pages/DeveloperPortal';
import { Analytics } from './pages/Analytics';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { useAuthStore } from './store/authStore';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import './App.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

function App() {
  const { isAuthenticated } = useAuthStore();

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="app">
          {isAuthenticated ? (
            <>
              <Navbar />
              <div className="app-container">
                <Sidebar />
                <main className="main-content">
                  <Routes>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/matchmaking" element={<Matchmaking />} />
                    <Route path="/profile/:userId" element={<Profile />} />
                    <Route path="/store" element={<Store />} />
                    <Route path="/leaderboard" element={<Leaderboard />} />
                    <Route path="/social" element={<Social />} />
                    <Route path="/developer" element={<DeveloperPortal />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                  </Routes>
                </main>
              </div>
            </>
          ) : (
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          )}
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
