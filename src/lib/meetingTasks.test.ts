// Urutan dan penandaan terlambat pada daftar tugas musyawarah. Kalau aturan ini
// rusak tidak ada error apa pun: daftarnya tetap tampil, hanya tugas yang sudah
// lewat batas tenggelam di bawah dan tidak pernah ditagih.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { meetingSummary, openMeetingTaskRows } from './meetingTasks.ts'
import type { Meeting, MeetingTask, MeetingTopic } from '../types/domain.ts'

function musyawarah(id: string, meetingDate: string): Meeting {
  return { id, title: `Musyawarah ${id}`, meetingDate, createdBy: null, createdAt: `${meetingDate}T00:00:00.000Z`, updatedAt: `${meetingDate}T00:00:00.000Z` }
}

function bahasan(id: string, meetingId: string, sortOrder = 0): MeetingTopic {
  return { id, meetingId, sortOrder, problem: `Bahasan ${id}`, solution: 'Keputusan' }
}

function tugas(over: Partial<MeetingTask> & { id: string; topicId: string }): MeetingTask {
  return {
    id: over.id,
    topicId: over.topicId,
    sortOrder: over.sortOrder ?? 0,
    task: over.task ?? `Tugas ${over.id}`,
    picJamaahId: over.picJamaahId ?? 'j-01',
    dueDate: over.dueDate ?? '',
    doneAt: over.doneAt ?? null,
    doneBy: over.doneBy ?? null,
  }
}

const meetings = [musyawarah('m-lama', '2026-09-01'), musyawarah('m-baru', '2026-10-01')]
const topics = [bahasan('t-lama', 'm-lama'), bahasan('t-baru', 'm-baru')]

test('tugas berbatas tanggal mendahului tugas tanpa batas tanggal', () => {
  const rows = openMeetingTaskRows(
    meetings,
    topics,
    [tugas({ id: 'tanpa-batas', topicId: 't-baru' }), tugas({ id: 'berbatas', topicId: 't-baru', dueDate: '2026-12-01' })],
    '2026-11-02',
  )
  assert.deepEqual(rows.map((row) => row.task.id), ['berbatas', 'tanpa-batas'])
})

test('batas tanggal terdekat lebih dulu dan yang terlewat ditandai terlambat', () => {
  const rows = openMeetingTaskRows(
    meetings,
    topics,
    [
      tugas({ id: 'nanti', topicId: 't-baru', dueDate: '2026-11-20' }),
      tugas({ id: 'telat', topicId: 't-baru', dueDate: '2026-10-15' }),
      tugas({ id: 'hari-ini', topicId: 't-baru', dueDate: '2026-11-02' }),
    ],
    '2026-11-02',
  )
  assert.deepEqual(rows.map((row) => row.task.id), ['telat', 'hari-ini', 'nanti'])
  assert.deepEqual(rows.map((row) => row.overdue), [true, false, false])
})

test('tugas selesai tidak masuk daftar, musyawarah lama lebih dulu saat batasnya sama', () => {
  const rows = openMeetingTaskRows(
    meetings,
    topics,
    [
      tugas({ id: 'baru', topicId: 't-baru', dueDate: '2026-11-10' }),
      tugas({ id: 'lama', topicId: 't-lama', dueDate: '2026-11-10' }),
      tugas({ id: 'sudah', topicId: 't-lama', dueDate: '2026-10-01', doneAt: '2026-10-02T03:00:00.000Z' }),
    ],
    '2026-11-02',
  )
  assert.deepEqual(rows.map((row) => row.task.id), ['lama', 'baru'])
})

test('tugas yang bahasannya hilang dibuang, bukan ditampilkan tanpa konteks', () => {
  const rows = openMeetingTaskRows(meetings, topics, [tugas({ id: 'yatim', topicId: 't-hilang' })], '2026-11-02')
  assert.equal(rows.length, 0)
})

test('ringkasan notulensi hanya menghitung bahasan dan tugas miliknya sendiri', () => {
  const tasks = [
    tugas({ id: 'a', topicId: 't-lama', doneAt: '2026-09-10T00:00:00.000Z' }),
    tugas({ id: 'b', topicId: 't-lama' }),
    tugas({ id: 'c', topicId: 't-baru' }),
  ]
  assert.deepEqual(meetingSummary('m-lama', topics, tasks), { topicCount: 1, taskCount: 2, doneCount: 1 })
  assert.deepEqual(meetingSummary('m-baru', topics, tasks), { topicCount: 1, taskCount: 1, doneCount: 0 })
})
