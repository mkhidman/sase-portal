import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SuperadminRoute } from './components/RoleRoute'
import { AuthProvider } from './contexts/AuthContext'
import { DataProvider } from './contexts/DataContext'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { PasswordChangePage } from './pages/PasswordChangePage'
import { PasswordReadyRoute } from './components/PasswordReadyRoute'

// Halaman selain Login dan Dashboard dimuat terpisah agar muatan awal di HP tetap ringan.
const loaders = {
  attendance: () => import('./pages/AttendancePage'),
  audit: () => import('./pages/AuditPage'),
  census: () => import('./pages/CensusPage'),
  classes: () => import('./pages/ClassesPage'),
  classProgression: () => import('./pages/ClassProgressionPage'),
  dataQuality: () => import('./pages/DataQualityPage'),
  familyContacts: () => import('./pages/FamilyContactsPage'),
  followUps: () => import('./pages/FollowUpsPage'),
  jamaahArchive: () => import('./pages/JamaahArchivePage'),
  materials: () => import('./pages/MaterialsPage'),
  meetingFollowUps: () => import('./pages/MeetingFollowUpsPage'),
  meetingNotes: () => import('./pages/MeetingNotesPage'),
  monthlyReport: () => import('./pages/MonthlyReportPage'),
  notFound: () => import('./pages/NotFoundPage'),
  recap: () => import('./pages/RecapPage'),
  schedules: () => import('./pages/SchedulesPage'),
  settings: () => import('./pages/SettingsPage'),
}

const AttendancePage = lazy(() => loaders.attendance().then((m) => ({ default: m.AttendancePage })))
const AuditPage = lazy(() => loaders.audit().then((m) => ({ default: m.AuditPage })))
const CensusPage = lazy(() => loaders.census().then((m) => ({ default: m.CensusPage })))
const ClassesPage = lazy(() => loaders.classes().then((m) => ({ default: m.ClassesPage })))
const ClassProgressionPage = lazy(() => loaders.classProgression().then((m) => ({ default: m.ClassProgressionPage })))
const DataQualityPage = lazy(() => loaders.dataQuality().then((m) => ({ default: m.DataQualityPage })))
const FamilyContactsPage = lazy(() => loaders.familyContacts().then((m) => ({ default: m.FamilyContactsPage })))
const FollowUpsPage = lazy(() => loaders.followUps().then((m) => ({ default: m.FollowUpsPage })))
const JamaahArchivePage = lazy(() => loaders.jamaahArchive().then((m) => ({ default: m.JamaahArchivePage })))
const MaterialsPage = lazy(() => loaders.materials().then((m) => ({ default: m.MaterialsPage })))
const MeetingFollowUpsPage = lazy(() => loaders.meetingFollowUps().then((m) => ({ default: m.MeetingFollowUpsPage })))
const MeetingNotesPage = lazy(() => loaders.meetingNotes().then((m) => ({ default: m.MeetingNotesPage })))
const MonthlyReportPage = lazy(() => loaders.monthlyReport().then((m) => ({ default: m.MonthlyReportPage })))
const NotFoundPage = lazy(() => loaders.notFound().then((m) => ({ default: m.NotFoundPage })))
const RecapPage = lazy(() => loaders.recap().then((m) => ({ default: m.RecapPage })))
const SchedulesPage = lazy(() => loaders.schedules().then((m) => ({ default: m.SchedulesPage })))
const SettingsPage = lazy(() => loaders.settings().then((m) => ({ default: m.SettingsPage })))

// Setelah tampilan pertama selesai, seluruh halaman diunduh diam-diam supaya service worker
// menyimpannya. Tanpa ini, halaman yang belum pernah dibuka akan gagal saat perangkat offline.
function usePrefetchAllRoutes() {
  useEffect(() => {
    const prefetch = () => Object.values(loaders).forEach((load) => { void load().catch(() => {}) })
    const timer = window.setTimeout(prefetch, 2500)
    return () => window.clearTimeout(timer)
  }, [])
}

export default function App() {
  const Router = import.meta.env.VITE_MEMORY_ROUTER === 'true' ? MemoryRouter : BrowserRouter
  usePrefetchAllRoutes()
  return (
    <Router>
      <AuthProvider>
        <DataProvider>
          <Suspense fallback={<div className="loading-screen">Memuat halaman…</div>}>
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
                  <Route path="*" element={<NotFoundPage />} />
                </Route>
                </Route>
              </Route>
            </Routes>
          </Suspense>
        </DataProvider>
      </AuthProvider>
    </Router>
  )
}
