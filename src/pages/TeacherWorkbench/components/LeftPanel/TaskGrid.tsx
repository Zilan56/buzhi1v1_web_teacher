import { taskMeta } from '../../config/taskConfig'
import { ENABLED_TASK_KEYS } from '../../config/launch'
import { useWorkbenchStore } from '../../store/workbenchStore'
import { TaskCard } from './TaskCard'

export function TaskGrid() {
  const openTaskModal = useWorkbenchStore((s) => s.openTaskModal)
  const taskCounts = useWorkbenchStore((s) => s.taskCounts)

  return (
    <div className="p-4 pt-2">
      <div className="text-xs font-semibold text-[var(--color-text-secondary)]">
        今日任务
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {ENABLED_TASK_KEYS.map((taskKey) => (
          <TaskCard
            key={taskKey}
            taskKey={taskKey}
            label={taskMeta[taskKey].label}
            count={taskCounts[taskKey]}
            tone={taskMeta[taskKey].badgeTone}
            onClick={openTaskModal}
          />
        ))}
      </div>
    </div>
  )
}
