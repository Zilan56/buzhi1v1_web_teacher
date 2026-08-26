export interface ReviewLossPointDefinition {
  lossPointKey: number
  reason: string
  description: string
  checkpointName: string
  standard: number
}

export const LOSS_POINT_DEFINITIONS: ReviewLossPointDefinition[] = [
  { lossPointKey: 1, reason: '审漏作答要素；对作答要素不理解；要点取舍原则不清', description: '找点不全面、不准确', checkpointName: '要点不全不准', standard: 80 },
  { lossPointKey: 2, reason: '没有识别出段落的总结性信息', description: '前置词错误', checkpointName: '要点不全不准', standard: 80 },
  { lossPointKey: 3, reason: '没有识别出全篇材料的结构；不清楚总括句的相关知识', description: '总括句错误', checkpointName: '要点不全不准', standard: 80 },
  { lossPointKey: 4, reason: '没有识别出题干和材料中的分类提示；对分类的本质不了解', description: '分类不正确', checkpointName: '要点不全不准', standard: 80 },
  { lossPointKey: 5, reason: '对于零散的材料无法抓住重点', description: '提炼不全面、不准确', checkpointName: '提炼转述困难', standard: 75 },
  { lossPointKey: 6, reason: '没有识别出分析题题干和材料对答题结构的提示', description: '综合分析答题结构不准确', checkpointName: '分析结构不清', standard: 75 },
  { lossPointKey: 7, reason: '没有识别出对策题题干和材料对答题结构的提示', description: '对策题答题结构不准确', checkpointName: '对策推导困难', standard: 75 },
  { lossPointKey: 8, reason: '不清楚对策的来源；不理解题干要求；不清楚推导对策的方法', description: '对策推导不完整、可行', checkpointName: '对策推导困难', standard: 75 },
  { lossPointKey: 9, reason: '没有按照题干的提示分析出完整的框架', description: '公文答题结构不准确', checkpointName: '公文结构不清', standard: 75 },
  { lossPointKey: 10, reason: '公文格式死记硬背，不理解背后的底层逻辑', description: '公文格式错误', checkpointName: '公文结构不清', standard: 75 },
  { lossPointKey: 11, reason: '不知道什么情况用什么语言风格', description: '公文语言风格不正确', checkpointName: '公文结构不清', standard: 75 },
  { lossPointKey: 12, reason: '不知道什么是文体', description: '作文文体判断错误', checkpointName: '作文立意不准', standard: 100 },
  { lossPointKey: 13, reason: '不知道怎么选择主题词', description: '作文主题词错误', checkpointName: '作文立意不准', standard: 70 },
  { lossPointKey: 14, reason: '没有书写角度的概念', description: '分论点角度写错', checkpointName: '作文立意不准', standard: 100 },
  { lossPointKey: 15, reason: '不知道如何从题干或是材料中找出并整合分论点', description: '分论点关键词错误', checkpointName: '作文立意不准', standard: 70 },
  { lossPointKey: 16, reason: '对作文的论证结构不了解', description: '论证逻辑框架错误', checkpointName: '作文论证不清', standard: 70 },
  { lossPointKey: 17, reason: '论证思维混乱，想到什么写什么', description: '论证内容交叉', checkpointName: '作文论证不清', standard: 70 },
  { lossPointKey: 18, reason: '凭语感写，没有考虑过论证是否成立', description: '论证闭环未完成', checkpointName: '作文论证不清', standard: 70 },
  { lossPointKey: 19, reason: '不知道如何联想论证素材', description: '论证内容不充实', checkpointName: '作文论证不清', standard: 70 },
  { lossPointKey: 20, reason: '不知道怎么组织一句话', description: '表达有语病、不流畅', checkpointName: '作文表达不畅', standard: 70 },
  { lossPointKey: 21, reason: '缺少好词好句的积累或积累得过于死板', description: '表达口语化、模板化', checkpointName: '作文表达不畅', standard: 70 },
  { lossPointKey: 22, reason: '平时不爱动笔，没有养成好的书写习惯', description: '字迹潦草，卷面不整洁', checkpointName: '包含在卡点内解决', standard: 70 },
]
