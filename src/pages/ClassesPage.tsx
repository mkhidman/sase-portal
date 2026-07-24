import { Shuffle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/UI'
import { useData } from '../contexts/DataContext'

export function ClassesPage() {
  const { classes, jamaah } = useData()
  return (
    <>
      <PageHeader title="Kelas Pengajian" description="Satu warga dapat mengikuti lebih dari satu kelas atau jenis pengajian." actions={<Link className="button primary" to="/kenaikan-kelas"><Shuffle size={16} /> Kenaikan & Mutasi</Link>} />
      <section className="class-grid">
        {classes.map((studyClass) => {
          const members = jamaah.filter((person) => person.active && person.classIds.includes(studyClass.id))
          return (
            <article className="card class-card" key={studyClass.id}>
              <div className="card-heading"><div><h2>{studyClass.name}</h2><p>{studyClass.name === '5 Unsur' ? 'Anggota ditentukan secara manual.' : 'Keanggotaan mengikuti data sensus warga.'}</p></div><span className={`badge ${studyClass.active ? 'success' : 'danger'}`}>{studyClass.active ? 'Aktif' : 'Nonaktif'}</span></div>
              <div className="class-summary">
                <span><small>Total</small><strong>{members.length}</strong></span>
                <span><small>Laki-laki</small><strong>{members.filter((person) => person.gender === 'Laki-laki').length}</strong></span>
                <span><small>Perempuan</small><strong>{members.filter((person) => person.gender === 'Perempuan').length}</strong></span>
              </div>
            </article>
          )
        })}
      </section>
    </>
  )
}
