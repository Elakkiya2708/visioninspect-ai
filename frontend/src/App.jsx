import { Suspense, lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './auth'
import Layout from './components/Layout'
import { Loading } from './components/ui'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'

// Route-level code splitting keeps the first page load small (charts only load when needed).
const NewInspection = lazy(() => import('./pages/NewInspection'))
const Inspections = lazy(() => import('./pages/Inspections'))
const InspectionDetail = lazy(() => import('./pages/InspectionDetail'))
const Analytics = lazy(() => import('./pages/Analytics'))
const Models = lazy(() => import('./pages/Models'))
const UsersPage = lazy(() => import('./pages/Users'))

function Guard({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />
  return children
}

export default function App() {
  const { user, loading } = useAuth()
  if (loading) return <Loading text="Starting VisionInspect AI…" />
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
        <Route element={<Guard><Layout /></Guard>}>
          <Route index element={<Dashboard />} />
          <Route path="inspect" element={<NewInspection />} />
          <Route path="inspections" element={<Inspections />} />
          <Route path="inspections/:id" element={<InspectionDetail />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="models" element={<Guard roles={['admin', 'quality_engineer']}><Models /></Guard>} />
          <Route path="users" element={<Guard roles={['admin']}><UsersPage /></Guard>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
