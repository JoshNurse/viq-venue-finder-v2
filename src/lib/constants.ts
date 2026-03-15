export const PIPELINE_STAGES = [
  'NOT_CONTACTED',
  'VISITED',
  'CONTACTED',
  'MEETING_SCHEDULED',
  'DEMO',
  'PROPOSAL',
  'NEGOTIATION',
  'WON',
  'LOST',
] as const

export type PipelineStage = typeof PIPELINE_STAGES[number]

export const PIPELINE_STAGE_LABELS: Record<PipelineStage, string> = {
  NOT_CONTACTED: 'Not Contacted',
  VISITED: 'Visited',
  CONTACTED: 'Contacted',
  MEETING_SCHEDULED: 'Meeting Scheduled',
  DEMO: 'Demo',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
}

export const PIPELINE_STAGE_COLORS: Record<PipelineStage, string> = {
  NOT_CONTACTED: 'bg-gray-100 text-gray-700',
  VISITED: 'bg-blue-100 text-blue-700',
  CONTACTED: 'bg-indigo-100 text-indigo-700',
  MEETING_SCHEDULED: 'bg-purple-100 text-purple-700',
  DEMO: 'bg-yellow-100 text-yellow-700',
  PROPOSAL: 'bg-orange-100 text-orange-700',
  NEGOTIATION: 'bg-pink-100 text-pink-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-red-100 text-red-700',
}

export const CONTACT_ROLES = [
  'CEO_GM',
  'GAMING_MANAGER',
  'MARKETING_MANAGER',
  'OPERATIONS_MANAGER',
  'OTHER',
] as const

export type ContactRole = typeof CONTACT_ROLES[number]

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  CEO_GM: 'CEO / General Manager',
  GAMING_MANAGER: 'Gaming Manager',
  MARKETING_MANAGER: 'Marketing Manager',
  OPERATIONS_MANAGER: 'Operations Manager',
  OTHER: 'Other Contact',
}

export const ACTIVITY_TYPES = [
  'NOTE',
  'CALL',
  'EMAIL',
  'VISIT',
  'STAGE_CHANGE',
  'DATA_IMPORT',
  'DATA_EDIT',
] as const

export type ActivityType = typeof ACTIVITY_TYPES[number]

export const TASK_TYPES = [
  'FOLLOW_UP',
  'CALL_BACK',
  'SEND_PROPOSAL',
  'SCHEDULE_DEMO',
  'OTHER',
] as const

export type TaskType = typeof TASK_TYPES[number]

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  FOLLOW_UP: 'Follow Up',
  CALL_BACK: 'Call Back',
  SEND_PROPOSAL: 'Send Proposal',
  SCHEDULE_DEMO: 'Schedule Demo',
  OTHER: 'Other',
}

// Stages that require a note when transitioning to them
export const NOTE_REQUIRED_STAGES: PipelineStage[] = ['DEMO', 'PROPOSAL', 'WON', 'LOST']

export const LMO_OPTIONS = ['MAXGAMING', 'ODYSSEY'] as const

export const CSV_URL = 'https://data.gov.au/data/dataset/4f3c0fa3-d2d4-43f5-b1d7-9bd20a9b3187/resource/b7612b1f-ae90-4be4-8de2-15c52b8bc8d2/download/site-level-egm-data-as-at-1-february-2025.csv'
