import { Compass, LayoutDashboard } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { PageNotice } from '../components/UI'

export function NotFoundPage() {
  const location = useLocation()
  return (
    <PageNotice
      icon={<Compass size={26} />}
      title="Halaman tidak ditemukan"
      description={`Alamat ${location.pathname} tidak tersedia. Kemungkinan tautannya sudah berubah atau salah ketik. Gunakan menu navigasi atau kembali ke Dashboard.`}
      action={<Link className="button primary" to="/"><LayoutDashboard size={16} /> Kembali ke Dashboard</Link>}
    />
  )
}
