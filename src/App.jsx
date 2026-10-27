import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Search from './pages/Search.jsx'
import Favorites from './pages/Favorites.jsx'
import Profile from './pages/Profile.jsx'
import Login from './pages/Login.jsx'
import ExpertDetail from './pages/ExpertDetail.jsx'
import Requests from './pages/Requests.jsx'
import RequestDetail from './pages/RequestDetail.jsx'
import { useAuth } from './context/AuthContext.jsx'

function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout><Home /></Layout>} />
      <Route path="/search" element={<Layout><Search /></Layout>} />
      <Route path="/favorites" element={<Layout><Favorites /></Layout>} />
      <Route path="/requests" element={<Layout><Requests /></Layout>} />
      <Route path="/requests/:id" element={<RequestDetail />} />
      <Route path="/login" element={<Layout><Login /></Layout>} />
      <Route
        path="/profile"
        element={<RequireAuth><Layout><Profile /></Layout></RequireAuth>}
      />
      <Route path="/expert/:id" element={<ExpertDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
