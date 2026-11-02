import type { Meeting, MeetingTask, MeetingTopic } from '../types/domain'

export interface MeetingTaskRow {
  task: MeetingTask
  topic: MeetingTopic
  meeting: Meeting
  overdue: boolean
}

export interface MeetingSummary {
  topicCount: number
  taskCount: number
  doneCount: number
}

/**
 * Tugas yang belum dicentang dari seluruh musyawarah, diurutkan sesuai urgensi
 * penagihan: batas tanggal terdekat lebih dulu, tugas tanpa batas tanggal paling
 * belakang, lalu musyawarah yang lebih lama menunggu.
 *
 * Tugas yatim (bahasan atau musyawarahnya tidak ada di data) dibuang, bukan
 * ditampilkan tanpa konteks.
 */
export function openMeetingTaskRows(
  meetings: Meeting[],
  topics: MeetingTopic[],
  tasks: MeetingTask[],
  today: string,
): MeetingTaskRow[] {
  const topicById = new Map(topics.map((item) => [item.id, item]))
  const meetingById = new Map(meetings.map((item) => [item.id, item]))

  return tasks
    .filter((task) => !task.doneAt)
    .flatMap((task) => {
      const topic = topicById.get(task.topicId)
      const meeting = topic ? meetingById.get(topic.meetingId) : undefined
      if (!topic || !meeting) return []
      return [{ task, topic, meeting, overdue: Boolean(task.dueDate) && task.dueDate < today }]
    })
    .sort((a, b) => {
      if (Boolean(a.task.dueDate) !== Boolean(b.task.dueDate)) return a.task.dueDate ? -1 : 1
      if (a.task.dueDate !== b.task.dueDate) return a.task.dueDate < b.task.dueDate ? -1 : 1
      if (a.meeting.meetingDate !== b.meeting.meetingDate) return a.meeting.meetingDate < b.meeting.meetingDate ? -1 : 1
      if (a.topic.sortOrder !== b.topic.sortOrder) return a.topic.sortOrder - b.topic.sortOrder
      return a.task.sortOrder - b.task.sortOrder
    })
}

export function meetingSummary(meetingId: string, topics: MeetingTopic[], tasks: MeetingTask[]): MeetingSummary {
  const topicIds = new Set(topics.filter((item) => item.meetingId === meetingId).map((item) => item.id))
  const own = tasks.filter((item) => topicIds.has(item.topicId))
  return {
    topicCount: topicIds.size,
    taskCount: own.length,
    doneCount: own.filter((item) => item.doneAt).length,
  }
}
