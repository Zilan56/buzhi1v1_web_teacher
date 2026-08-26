export type TaskKey =
  | 'pendingClass'
  | 'pendingReply'
  | 'abnormalUser'
  | 'pendingReview'
  | 'pendingReport'
  | 'pendingAssign'
  | 'pendingDiagnosePaper'
  | 'pendingLink'
  | 'liveDrill'
  | 'pendingHandout'
  | 'pendingFeedback'

export type MessageTabKey = 'yesterdayUnreplied' | 'abnormalUsers' | 'todayMessages' | 'complaints' | 'colleagues'

export type RightTabKey = 'schedule' | 'chat' | 'students' | 'dashboard' | 'mailbox' | 'overview' | 'scheduling'

export interface ContactItem {
  id: string
  name: string
  avatar: string
  color: string
  preview: string
  time: string
  unreadCount: number
  tag?: 'complaint'
  contactType?: 'student' | 'colleague'
  subtitle?: string
  studentId?: string
  studentStatus?: 'normal' | 'warning' | 'new' | 'leave' | 'completed'
  lastMessageAt?: string | null
  lastSenderType?: 'teacher' | 'student' | null
}

export interface TaskListItem {
  id: string
  name: string
  subtitle: string
  avatar: string
  color: string
  actionLabel: string
  contactId?: string
  tmLink?: string
  studentId?: string
  eventId?: string
  taskRowId?: string
  linkType?: 'live' | 'replay'
  courseType?: 'diagnose' | 'consensus' | 'correction'
  pointName?: string
  reportCategory?: 'diagnose' | 'checkpoint' | 'drill'
  stageKey?: string
  taskId?: string
  feedbackId?: string
  presetCheckpoints?: string[]
  preferredTeacherId?: string
}

export interface CalEvent {
  id: string
  date: string       // yyyy-MM-dd
  startTime: string  // HH:mm
  endTime: string    // HH:mm
  title: string
  type: 'class' | 'meeting'
  studentId?: string
  link?: string
}

export interface ChatMessage {
  id: string
  clientId?: string
  contactId: string
  sender: GroupRole
  senderName: string
  text: string
  time: string
  date?: string        // yyyy-MM-dd
  pending?: boolean
  failed?: boolean     // 发送失败（WS 断开 / 回退 HTTP 也失败），气泡上提供重发
  recalled?: boolean
  replyTo?: { id: string; senderName: string; text: string }
  msgType?: 'text' | 'image' | 'file' | 'audio'
  fileUrl?: string
  fileName?: string
  fileSize?: string
  audioDuration?: number
}

export type GroupRole = '带教老师' | '学管' | '校长' | '诊断老师' | '刷题老师' | '学生'

export interface GroupMember {
  role: GroupRole
  name: string
  teacherId?: string
}

export interface PrivateChatSession {
  id: string
  groupContactId: string
  memberName: string
  memberRole: GroupRole
  avatarColor: string
  lastMsg?: string
  lastTime?: string
}

export interface ContactNote {
  id: string
  contactId: string
  authorName: string
  text: string
  createdAt: string
}

export interface AbnormalStudent {
  id: string
  name: string
  status: 'normal' | 'warning' | 'new' | 'leave' | 'completed'
  reason: string
  severity: 'high' | 'medium' | 'low'
  updatedAt: string
}

export interface StudentItem {
  id: string
  name: string
  avatar: string
  color: string
  grade: string
  subject: string
  lastSession: string
  status: 'normal' | 'warning' | 'new' | 'leave' | 'completed'
  contactId?: string
}

export interface KpointAssignment {
  title: string
  score: number
  accuracy: number
  date: string
}

export interface KnowledgePoint {
  name: string
  progress: number
  status: 'mastered' | 'learning' | 'weak'
  assignments?: KpointAssignment[]
}

export interface StudentFeedback {
  id: string
  sessionLabel: string
  date: string
  rating: number
  tags: string[]
  comment: string
}

export type AnswerStatus = 'pending' | 'reviewed'
export type QuestionType = '\u5165\u5b66\u8bca\u65ad' | '\u5361\u70b9\u7ec3\u4e60\u9898' | '\u5361\u70b9\u8003\u8bd5' | '\u6574\u5377\u6279\u6539'

export interface QuestionAnswer {
  id: string
  questionTitle: string
  questionType: QuestionType
  studentAnswer: string
  submittedAt: string
  status: AnswerStatus
  score?: number
  teacherComment?: string
  reviewedAt?: string
  checkpoint?: string
  pointName?: string
  stageKey?: string
  taskId?: string
  feedbackTaskId?: string
  reviewedFileName?: string
  fileName?: string
}

export interface TeacherNote {
  role: string
  name: string
  content: string
  date: string
}

export interface Handout {
  id: string
  fileName: string
  uploadedBy: string
  role: string
  date: string
  sessionLabel: string
}

export interface Replay {
  id: string
  sessionLabel: string
  date: string
  url: string
  duration?: string
}

export interface PracticeQuestion {
  id: string
  title: string
  selectionType: 'default' | 'manual' | 'weak'
  videoId?: string
  handoutPdf?: string
  analysisPdf?: string
}

export interface CheckpointContent {
  id: string
  name: string
  theoryVideoId?: string
  theoryHandoutPdf?: string
  examTitle?: string
  examVideoId?: string
  examHandoutPdf?: string
  examAnalysisPdf?: string
  practiceQuestions: PracticeQuestion[]
  standardPath: string[]
  learningObjectives: string[]
}

export interface KpointTeacherGroup {
  kpoint: string
  color: string
  teachers: { role: string; name: string }[]
}


export interface StudentInfoItem {
  id: string
  studentId: string
  authorName: string
  authorRole: string
  content: string
  createdAt: string
}

export interface StudentCourseProgress {
  id: string
  name: string
  subject: string
  progress: number
  status: 'in_progress' | 'completed' | 'failed' | 'pending'
  learningPathProgress?: {
    pointName: string
    progressPercent: number
    totalTaskCount: number
    doneTaskCount: number
    allDone: boolean
    currentTaskId: string
    currentTaskTitle: string
    currentStageKey: string
    currentStageLabel: string
    updatedAt: string
  } | null
  assignedTeacherId?: string | null
  assignedTeacherName?: string | null
  assignedTeamRole?: string | null
  assignedTeamRoleLabel?: string | null
}

export interface StudentTeamTeacher {
  id: string
  name: string
  role: string
  title?: string
  status?: string
}

export interface CheckpointTab {
  name: string
  hasData: boolean
}

export interface StudentDetailMeta {
  joinDate: string | null
  sessionCount: number
  totalHours: number
  courses: StudentCourseProgress[]
  checkpoints: CheckpointTab[]
  teamTeachers: StudentTeamTeacher[]
  profile: {
    gender?: string | null
    grade?: string | null
    hometown?: string | null
    examStatus?: string | null
    examDate?: string | null
    education?: string | null
    major?: string | null
    avatarUrl?: string | null
  }
  flagReason?: string | null
  flagSeverity?: string | null
}

export interface ComplaintAttachment {
  id: string
  name: string
  dataUrl: string    // base64
}

export interface ComplaintRecord {
  id: string
  studentId: string
  studentName: string
  demand: string          // 閻庢冻濡囬弫鎾舵嫚婢跺婀?
  reason: string          // 闁硅埖娲濋惁鏃堝储閻旈攱绀?
  suggestion: string      // 閻熸瑱绲介崰鍛嚈妤︽鍞?
  resolvers: string[]     // 鐎点倝缂氶鍛喆閿濆懎鏋€濞存粎灏ㄧ槐娆戞喆閹烘洖顥忛柛姘▌缁?
  deadline: string        // YYYY-MM-DD
  extraNote: string       // 閻炴稏鍎遍崢鏍嫚鐎涙ɑ顫栭柨娑樼墕瑜版煡鏌呮径娑氱
  attachments: ComplaintAttachment[]
  submittedBy: string
  submittedAt: string     // ISO
  status: 'pending' | 'resolved'
  resolvedAt?: string
  resolvedNote?: string
}
