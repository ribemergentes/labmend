import { useEffect } from 'react'
import { HashRouter as BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAppStore } from './store/appStore'
import { hasPermission } from './services/auth'
import Layout from './components/layout/Layout'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PatientsPage from './pages/PatientsPage'
import PatientFormPage from './pages/PatientFormPage'
import PatientHistoryPage from './pages/PatientHistoryPage'
import OrdersPage from './pages/OrdersPage'
import OrderFormPage from './pages/OrderFormPage'
import OrderDetailPage from './pages/OrderDetailPage'
import ResultsPage from './pages/ResultsPage'
import ExamCatalogPage from './pages/ExamCatalogPage'
import ReportsPage from './pages/ReportsPage'
import UsersPage from './pages/UsersPage'
import SettingsPage from './pages/SettingsPage'
import FinancialPage from './pages/FinancialPage'
import NotificationsBar from './components/ui/NotificationsBar'
import UpdateDialog from './components/UpdateDialog'

function Guard({ children, adminOnly, perm }) {
  const user = useAppStore(s=>s.user)
  if (!user) return <Navigate to="/login" replace/>
  if (adminOnly && user.role !== 'administrador') return <Navigate to="/" replace/>
  if (perm && !hasPermission(user, perm)) return <Navigate to="/" replace/>
  return children
}

export default function App() {
  const { initTheme, user } = useAppStore()
  useEffect(() => { initTheme() }, [])

  return (
    <BrowserRouter>
      <NotificationsBar/>
      <UpdateDialog/>
      <Routes>
        <Route path="/login" element={!user ? <LoginPage/> : <Navigate to="/" replace/>}/>
        <Route path="/" element={<Guard><Layout/></Guard>}>
          <Route index element={<DashboardPage/>}/>
          <Route path="patients" element={<PatientsPage/>}/>
          <Route path="patients/new" element={<PatientFormPage/>}/>
          <Route path="patients/:id" element={<PatientHistoryPage/>}/>
          <Route path="patients/:id/edit" element={<PatientFormPage/>}/>
          <Route path="orders" element={<OrdersPage/>}/>
          <Route path="orders/new" element={<OrderFormPage/>}/>
          <Route path="orders/:id" element={<OrderDetailPage/>}/>
          <Route path="results/:orderExamId" element={<ResultsPage/>}/>
          <Route path="results/order/:orderId" element={<ResultsPage/>}/>
          <Route path="exams" element={<ExamCatalogPage/>}/>
          <Route path="reports" element={<ReportsPage/>}/>
          <Route path="financial" element={<Guard perm="financiero"><FinancialPage/></Guard>}/>
          <Route path="users" element={<Guard adminOnly><UsersPage/></Guard>}/>
          <Route path="settings" element={<Guard adminOnly><SettingsPage/></Guard>}/>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
