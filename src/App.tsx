import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SuperadminRoute } from './components/RoleRoute'
import { AuthProvider } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { AttendancePage } from './pages/AttendancePage'
import { AuditPage } from './pages/AuditPage'
import { CensusPage } from './pages/CensusPage'
import { ClassesPage } from './pages/ClassesPage'
import { ClassProgressionPage } from './pages/ClassProgressionPage'
import { DashboardPage } from './pages/DashboardPage'
import { DataQualityPage } from './pages/DataQualityPage'
import { LoginPage } from './pages/LoginPage'
import { JamaahArchivePage } from './pages/JamaahArchivePage'
import { FollowUpsPage } from './pages/FollowUpsPage'
import { FamilyContactsPage } from './pages/FamilyContactsPage'
import { MaterialsPage } from './pages/MaterialsPage'
import { MonthlyReportPage } from './pages/MonthlyReportPage'
import { MeetingFollowUpsPage } from './pages/MeetingFollowUpsPage'
import { MeetingNotesPage } from './pages/MeetingNotesPage'
import { RecapPage } from './pages/RecapPage'
import { SchedulesPage } from './pages/SchedulesPage'
import { SettingsPage } from './pages/SettingsPage'
import { PasswordChangePage } from './pages/PasswordChangePage'
import { PasswordReadyRoute } from './components/PasswordReadyRoute'

export default function App() {
  const Router = import.meta.env.VITE_MEMORY_ROUTER === 'true' ? MemoryRouter : BrowserRouter
  return (
    <Router>
      <AuthProvider>
        <DataProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="ganti-password" element={<PasswordChangePage />} />
              <Route element={<PasswordReadyRoute />}>
              <Route element={<AppLayout />}>
                <Route index element={<DashboardPage />} />
                <Route path="jadwal" element={<SchedulesPage />} />
                <Route path="absensi" element={<AttendancePage />} />
                <Route path="materi" element={<MaterialsPage />} />
                <Route path="tindak-lanjut" element={<FollowUpsPage />} />
                <Route path="keluarga-wali" element={<FamilyContactsPage />} />
                <Route path="rekap" element={<RecapPage />} />
                <Route path="laporan-bulanan" element={<MonthlyReportPage />} />
                <Route path="notulensi" element={<MeetingNotesPage />} />
                <Route path="notulensi/tindak-lanjut" element={<MeetingFollowUpsPage />} />
                <Route element={<SuperadminRoute />}>
                  <Route path="sensus" element={<CensusPage />} />
                  <Route path="kualitas-data" element={<DataQualityPage />} />
                  <Route path="kelas" element={<ClassesPage />} />
                  <Route path="kenaikan-kelas" element={<ClassProgressionPage />} />
                  <Route path="arsip-jamaah" element={<JamaahArchivePage />} />
                  <Route path="pengaturan" element={<SettingsPage />} />
                  <Route path="aktivitas" element={<AuditPage />} />
                </Route>
              </Route>
              </Route>
            </Route>
          </Routes>
        </DataProvider>
      </AuthProvider>
    </Router>
  )
}
