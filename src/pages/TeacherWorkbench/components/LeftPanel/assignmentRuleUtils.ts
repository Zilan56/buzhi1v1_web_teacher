import type {
  AssignmentKnowledgeType,
  AssignmentProvinceRuleMode,
  AssignmentResourceItem,
  AssignmentTheoryRow,
} from './assignmentLibrary.generated'

function hasProvince(provinceKeys: string[], selectedProvince: string) {
  return provinceKeys.includes(selectedProvince)
}

function isVisibleForProvince(
  provinceRuleMode: AssignmentProvinceRuleMode,
  provinceKeys: string[],
  selectedProvince: string,
) {
  if (!selectedProvince) return true
  if (provinceRuleMode === 'only') return hasProvince(provinceKeys, selectedProvince)
  return true
}

function isRequiredForProvince(
  baseType: AssignmentKnowledgeType,
  provinceRuleMode: AssignmentProvinceRuleMode,
  provinceKeys: string[],
  selectedProvince: string,
) {
  if (!selectedProvince) return baseType === 'required'
  if (provinceRuleMode === 'required_in') return hasProvince(provinceKeys, selectedProvince) || baseType === 'required'
  if (provinceRuleMode === 'required_except') return !hasProvince(provinceKeys, selectedProvince) || baseType === 'required'
  return baseType === 'required'
}

const SLOT_ORDER: Record<string, number> = {
  practice_1: 1,
  practice_2: 2,
  practice_3: 3,
  exam: 1,
  remedial: 1,
}

export function isTheoryVisibleForProvince(row: AssignmentTheoryRow, selectedProvince: string) {
  return isVisibleForProvince(row.provinceRuleMode, row.provinceKeys, selectedProvince)
}

export function getTheoryKnowledgeTypeForProvince(
  row: AssignmentTheoryRow,
  selectedProvince: string,
): AssignmentKnowledgeType {
  return isRequiredForProvince(row.knowledgeType, row.provinceRuleMode, row.provinceKeys, selectedProvince)
    ? 'required'
    : 'optional'
}

export function isResourceVisibleForProvince(item: AssignmentResourceItem, selectedProvince: string) {
  if (!selectedProvince) return true
  if (item.provinceRuleMode === 'required_in') return hasProvince(item.provinceKeys, selectedProvince)
  if (item.provinceRuleMode === 'required_except') return !hasProvince(item.provinceKeys, selectedProvince)
  return isVisibleForProvince(item.provinceRuleMode, item.provinceKeys, selectedProvince)
}

export function isResourceRequiredForProvince(item: AssignmentResourceItem, selectedProvince: string) {
  if (!isResourceVisibleForProvince(item, selectedProvince)) return false
  if (item.selectionType === 'required') return true
  if (item.provinceRuleMode === 'required_in' || item.provinceRuleMode === 'required_except') return true
  return false
}

export function resolveResourceItemsForProvince(items: AssignmentResourceItem[], selectedProvince: string) {
  const visibleItems = items
    .filter((item) => isResourceVisibleForProvince(item, selectedProvince))
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))

  const grouped = new Map<string, AssignmentResourceItem[]>()
  visibleItems.forEach((item) => {
    const slotItems = grouped.get(item.slotKey) ?? []
    slotItems.push(item)
    grouped.set(item.slotKey, slotItems)
  })

  return Array.from(grouped.values())
    .map((slotItems) => {
      const replacement = slotItems.find((item) => item.isReplacement)
      return replacement ?? slotItems[0] ?? null
    })
    .filter((item): item is AssignmentResourceItem => item !== null)
    .sort((left, right) => {
      const leftOrder = SLOT_ORDER[left.slotKey] ?? 999
      const rightOrder = SLOT_ORDER[right.slotKey] ?? 999
      if (leftOrder !== rightOrder) return leftOrder - rightOrder
      return Number(left.sortOrder || 0) - Number(right.sortOrder || 0)
    })
}
