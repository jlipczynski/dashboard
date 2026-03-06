export type BacklogItemType = 'task' | 'idea' | 'note' | 'goal' | 'question'
export type BacklogPriority = 'A' | 'B' | 'C' | 'D' | 'E'
export type BacklogStatus = 'backlog' | 'this_week' | 'done' | 'archived'

export interface BacklogItem {
  id?: string
  title: string
  description?: string | null
  type: BacklogItemType
  pillar?: number | null
  project?: 'ovoc' | 'plantacja' | 'inne' | null
  priority: BacklogPriority
  is_wig: boolean
  due_date?: string | null
  status: BacklogStatus
  audio_filename?: string
  source_transcript?: string
  created_at?: string
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  createdTime: string
  size: string
}
