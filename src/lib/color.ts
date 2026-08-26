/**
 * 头像/标识颜色的唯一出处。
 * 历史上 STUDENT_COLORS / CONTACT_COLORS / TEACHER_COLORS 三份调色板与两份
 * colorFromName 散落各处，现统一到这里。
 */

/** 学生/会话头像配色（沿用原 CONTACT_COLORS 8 色） */
export const AVATAR_COLORS = ['#e8845a', '#d79c69', '#c48b7a', '#b58f6f', '#c8755c', '#9f7d69', '#d3a57c', '#b88d77']

/** 排课看板老师泳道/标识配色（沿用原 TEACHER_COLORS 6 色，与头像区分） */
export const TEACHER_COLORS = ['#e8845a', '#d79c69', '#5fa8d3', '#8a7bd1', '#63c1c7', '#5fbf84']

/** 按名字稳定取色（同名恒定同色）。palette 可选，默认头像配色。 */
export function colorFromName(name: string, palette: string[] = AVATAR_COLORS): string {
  if (palette.length === 0) return '#e8845a'
  const seed = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return palette[seed % palette.length]
}

export function teacherColorFromName(name: string): string {
  return colorFromName(name, TEACHER_COLORS)
}
