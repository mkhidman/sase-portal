import { Shuffle } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { GenderComposition, type GenderCompositionRow } from '../components/GenderComposition'
import { PageHeader } from '../components/UI'
import { useData } from '../contexts/DataContext'

const MANUAL_MEMBERSHIP_CLASS = '5 Unsur'

export function ClassesPage() {
  const { classes, jamaah } = useData()

  const rows = useMemo<GenderCompositionRow[]>(() => {
    const build = (groupLabel?: string) => (studyClass: (typeof classes)[number]): GenderCompositionRow => {
      const members = jamaah.filter((person) => person.active && person.classIds.includes(studyClass.id))
      return {
        key: studyClass.id,
        label: studyClass.name,
        male: members.filter((person) => person.gender === 'Laki-laki').length,
        female: members.filter((person) => person.gender === 'Perempuan').length,
        total: members.length,
        groupLabel,
      }
    }
    const inactive = classes.filter((item) => !item.active)
    return [
      ...classes.filter((item) => item.active).map(build()),
      ...inactive.map(build('Kelas nonaktif')),
    ]
  }, [classes, jamaah])

  const hasManualClass = classes.some((item) => item.name === MANUAL_MEMBERSHIP_CLASS)

  return (
    <>
      <PageHeader title="Kelas Pengajian" description="Satu warga dapat mengikuti lebih dari satu kelas atau jenis pengajian." actions={<Link className="button primary" to="/kenaikan-kelas"><Shuffle size={16} /> Kenaikan & Mutasi</Link>} />
      <article className="card">
        <div className="card-heading">
          <div>
            <h2>Komposisi Kelas Pengajian</h2>
            <p>Jumlah warga aktif laki-laki dan perempuan pada setiap kelas. Panjang batang sebanding dengan kelas terbesar.</p>
          </div>
        </div>
        <GenderComposition
          rows={rows}
          totalLabel="Total keanggotaan"
          footnote={
            <>
              Total keanggotaan lebih besar dari jumlah warga karena satu warga dapat mengikuti lebih dari satu kelas.
              {hasManualClass ? ` Keanggotaan ${MANUAL_MEMBERSHIP_CLASS} ditentukan secara manual, sisanya mengikuti data sensus warga.` : ''}
            </>
          }
        />
      </article>
    </>
  )
}
