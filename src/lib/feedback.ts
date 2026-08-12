export type FeedbackTone = 'success' | 'error' | 'info'

export interface Feedback {
  text: string
  tone: FeedbackTone
}

export function feedbackOk(text: string): Feedback {
  return { text, tone: 'success' }
}

export function feedbackInfo(text: string): Feedback {
  return { text, tone: 'info' }
}

export function feedbackError(text: string): Feedback {
  return { text, tone: 'error' }
}

// Nada pesan ditentukan di tempat kejadian, bukan ditebak dari isi kalimatnya.
export function feedbackFrom(cause: unknown, fallback: string): Feedback {
  return feedbackError(cause instanceof Error ? cause.message : fallback)
}
