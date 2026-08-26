import { useEffect } from 'react'
import { logger } from '../../lib/logger'
import { LeftPanel } from './components/LeftPanel/LeftPanel'
import { TaskModal } from './components/LeftPanel/TaskModal'
import { ReviewModal } from './components/LeftPanel/ReviewModal'
import { AbnormalModal } from './components/LeftPanel/AbnormalModal'
import { AssignStudentModal } from './components/LeftPanel/AssignStudentModal'
import { DiagnosePaperModal } from './components/LeftPanel/DiagnosePaperModal'
import { LiveDrillModal } from './components/LeftPanel/LiveDrillModal'
import { UploadLinkModal } from './components/LeftPanel/UploadLinkModal'
import { UploadHandoutModal } from './components/LeftPanel/UploadHandoutModal'
import { UploadReplayModal } from './components/LeftPanel/UploadReplayModal'
import { ReportUploadWorkspace } from './components/LeftPanel/ReportUploadWorkspace'
import { StudentFeedbackModal } from './components/LeftPanel/StudentFeedbackModal'
import { RightPanel } from './components/RightPanel/RightPanel'
import { useWorkbenchStore } from './store/workbenchStore'

const pollLogger = logger.child('poll')

export function TeacherWorkbench({
  onLogout,
  onOpenIdentitySettings,
  teacherRoleLabel,
}: {
  onLogout?: () => void
  onOpenIdentitySettings?: () => void
  teacherRoleLabel?: string
}) {
  const loadCalendarEvents = useWorkbenchStore((s) => s.loadCalendarEvents)
  const loadTaskCounts     = useWorkbenchStore((s) => s.loadTaskCounts)
  const loadTaskItems      = useWorkbenchStore((s) => s.loadTaskItems)
  const loadStudents       = useWorkbenchStore((s) => s.loadStudents)
  const loadAbnormalStudents = useWorkbenchStore((s) => s.loadAbnormalStudents)
  const loadChatContacts   = useWorkbenchStore((s) => s.loadChatContacts)
  const loadComplaints     = useWorkbenchStore((s) => s.loadComplaints)
  const syncTeacherName    = useWorkbenchStore((s) => s.syncTeacherName)

  useEffect(() => {
    // store 创建早于登录，token 是登录后才有——这里同步一次老师名
    syncTeacherName()

    const pollJobs: Array<[string, () => Promise<void>]> = [
      ['calendar', loadCalendarEvents],
      ['taskCounts', loadTaskCounts],
      ['taskItems', loadTaskItems],
      ['students', loadStudents],
      ['abnormal', loadAbnormalStudents],
      ['chatContacts', loadChatContacts],
      ['complaints', loadComplaints],
    ]

    const runPoll = () => {
      pollJobs.forEach(([label, job]) => {
        // 轮询失败只告警，不清数据不弹错（旧数据优于空数据）
        job().catch((error: unknown) => {
          pollLogger.warn('poll.failed', { job: label, message: error instanceof Error ? error.message : String(error) })
        })
      })
    }

    runPoll()
    const interval = setInterval(runPoll, 30000)
    return () => clearInterval(interval)
  }, [loadAbnormalStudents, loadCalendarEvents, loadComplaints, loadTaskCounts, loadTaskItems, loadStudents, loadChatContacts, syncTeacherName])

  return (
    <div className="h-screen min-w-[1280px] overflow-hidden bg-[var(--color-page-bg)]">
      <div className="flex h-full w-full">
        <aside className="h-full w-[var(--left-width)] shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg-left)] shadow-[var(--shadow-xs)]">
          <LeftPanel
            onLogout={onLogout}
            onOpenIdentitySettings={onOpenIdentitySettings}
            teacherRoleLabel={teacherRoleLabel}
          />
        </aside>
        <main className="h-full flex-1 bg-[var(--color-page-bg)]">
          <RightPanel />
        </main>
      </div>
      <TaskModal />
      <ReviewModal />
      <AbnormalModal />
      <AssignStudentModal />
      <DiagnosePaperModal />
      <LiveDrillModal />
      <UploadLinkModal />
      <UploadHandoutModal />
      <UploadReplayModal />
      <ReportUploadWorkspace />
      <StudentFeedbackModal />
    </div>
  )
}

