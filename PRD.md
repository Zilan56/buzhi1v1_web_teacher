# 带教老师工作台 · 产品需求文档（PRD）

> 版本：v1.1 · 日期：2026-08-26
> 文档用途：描述当前已实现的功能范围，供设计验收与后端对接参考

## 修订记录

| 版本 | 日期 | 主要变更 |
|------|------|---------|
| v1.0 | 2026-04-06 | 初版，基于当时代码自动分析 |
| v1.1 | 2026-08-26 | 同步实际状态：React 19、Zustand 5、聊天 WS 已接入、总览页已启用、Markdown 注释替换原有详尽章节前移至 §0 README.md；新增 §13 改造日志 |

---

## 目录

1. [产品概述](#1-产品概述)
2. [用户角色与权限](#2-用户角色与权限)
3. [整体架构与界面关系](#3-整体架构与界面关系)
4. [功能模块详述](#4-功能模块详述)
   - 4.1 登录 / 注册
   - 4.2 左侧面板
   - 4.3 任务模块
   - 4.4 日程模块
   - 4.5 聊天模块
   - 4.6 学生管理模块
   - 4.7 批改工作台
   - 4.8 分配学员
   - 4.9 投诉管理
5. [全局状态管理](#5-全局状态管理)
6. [数据验证规则](#6-数据验证规则)
7. [错误处理与边界条件](#7-错误处理与边界条件)
8. [界面状态定义](#8-界面状态定义)
9. [用户体验细节](#9-用户体验细节)
10. [数据结构总览](#10-数据结构总览)
11. [后端接口清单](#11-后端接口清单)
12. [未完成 / 待规划](#12-未完成--待规划)

---

## 1. 产品概述

**产品名称**：带教老师工作台  
**产品形态**：Web 应用（PC 端优先）  
**用户群体**：带教老师（内部使用，账号由管理员创建或自行注册）  
**核心目标**：集中管理老师日常工作——查看任务、管理学生进度、处理聊天、安排日程、批改作业

**技术栈**：React 19 + TypeScript 5 + Tailwind CSS 4 + Zustand 5 + Vite 8 + date-fns 4 + pdfjs-dist 5

---

## 2. 用户角色与权限

### 2.1 角色定义

| 角色 | 说明 | 访问范围 |
|------|------|---------|
| 带教老师 | 主要使用者 | 全功能 |
| 诊断老师 | 负责诊断课学生 | 全功能（在"我的诊断"标签下查看学生） |
| 学管 | 学员管理 | StudentsView 中"学管"模式，查看诊断学员和卡点学员 |
| 校长 | 查看投诉 | 作为投诉解决人参与，暂无独立登录角色 |

> **当前版本**：仅实现"带教老师"账号体系（邮箱+密码登录），其他角色尚未独立建账号体系。

### 2.2 权限控制

| 功能 | 是否需要登录 | 备注 |
|------|------------|------|
| 登录/注册页 | 否（未登录可访问） | |
| 工作台所有功能 | 是 | token 存 localStorage；刷新后自动恢复登录状态 |
| 学生详情 | 是 | |
| 批改工作台 | 是 | |
| 投诉提交 | 是 | |

**权限判断逻辑**：  
- App.tsx 初始化时读取 `localStorage.getItem('teacher_token')`
- token 为空 → 显示 LoginPage
- token 存在 → 显示 TeacherWorkbench（当前版本不校验 token 有效期，依赖后端接口返回 401）

---

## 3. 整体架构与界面关系

```
App.tsx
├── LoginPage（未登录时）
└── TeacherWorkbench（已登录时）
    ├── 左侧面板（固定宽度 380px）
    │   ├── TeacherInfo（教师信息 + 退出）
    │   ├── TaskGrid（6 个任务卡片）
    │   ├── MessageTabs（4 个消息标签）
    │   └── ChatList（联系人列表 / 异常用户列表）
    │
    ├── 右侧面板（弹性宽度）
    │   ├── Tab：总览（OverviewView）
    │   ├── Tab：日程（CalendarView + InspireBar）
    │   ├── Tab：聊天（ChatView 或 OverviewView）
    │   ├── Tab：我的学生（StudentsView）
    │   └── Tab：去排课（SchedulingView）
    │
    └── 全局模态框（z-50，挂载在 body）
        ├── TaskModal（任务详情列表）
        ├── ReviewModal（待批改列表 + GradingWorkspace）
        ├── AbnormalModal（异常用户管理）
        ├── AssignStudentModal（分配学员）
        ├── UploadLinkModal（上传课程链接）
        ├── UploadHandoutModal（上传讲义）
        ├── UploadReplayModal（上传回放）
        ├── ManageMembersModal（群成员管理）
        ├── NotesModal（联系人备注）
        └── ComplaintModal（投诉提交）
```

### 界面数据流向

```
左侧 ChatList 点击联系人
    → store.selectContact(contactId)
    → store.rightTab 自动切换为 'chat'
    → 右侧 ChatView 渲染该联系人的消息

TaskGrid 点击任务卡片
    → store.openTaskModal(taskKey)
    → TaskModal 弹出，根据 taskKey 渲染对应列表
    → 列表内点击具体任务 → 触发各自动作

StudentsView 点击学生
    → 导航堆栈 push StudentDetailView
    → 可在 StudentDetailView 内点击"进入对话"
    → store.selectContact(contactId) + store.rightTab = 'chat'
```

---

## 4. 功能模块详述

---

### 4.1 登录 / 注册

#### 4.1.1 页面结构

- 全屏居中卡片，渐变背景（橙粉 → 浅紫）
- 顶部品牌区：橙色背景 + "带教老师工作台"标题
- 登录 / 注册切换标签（两个 Tab）
- 表单区域
- 提交按钮

#### 4.1.2 登录流程

**正常路径：**

1. 用户选择"登录"标签（默认）
2. 输入邮箱 + 密码
3. 点击"登 录"
4. 前端验证：邮箱和密码不能为空
5. 调用 `POST /api/auth/teacher/login` `{ email, password }`
6. 成功（200）：
   - 将 `token` 存入 `localStorage.teacher_token`
   - 调用 `onLogin(token)` → App.tsx 切换到工作台
7. 失败（401）：显示后端返回的 `message`（"账号或密码错误"）

**异常路径：**

| 情况 | 提示方式 |
|------|---------|
| 邮箱或密码为空 | 红色 inline 错误"请填写完整信息" |
| 账号密码错误（401） | 红色 inline 错误（后端 message） |
| 网络不通 | 红色 inline 错误"无法连接到服务器，请确认后端已启动" |
| 其他服务器错误（5xx） | 红色 inline 错误（后端 message） |

#### 4.1.3 注册流程

**正常路径：**

1. 用户点击"注册"标签
2. 表单显示额外字段：姓名、确认密码
3. 输入：姓名 + 邮箱 + 密码 + 确认密码
4. 前端验证（顺序执行，遇第一个失败即停止）：
   - 邮箱和密码不能为空
   - 姓名不能为空
   - 密码长度 ≥ 6 位
   - 两次密码必须一致
5. 调用 `POST /api/auth/teacher/register` `{ name, email, password }`
6. 成功（200）：同登录成功路径，直接进入工作台

**异常路径：**

| 情况 | 提示 |
|------|------|
| 邮箱已注册（409） | "该邮箱已注册" |
| 密码短于 6 位 | "密码至少 6 位" |
| 两次密码不一致 | "两次密码不一致" |

#### 4.1.4 密码显示/隐藏

- 密码框右侧眼睛图标，点击切换 `type="password"` / `type="text"`
- 登录和注册两个密码框共享同一个 `showPwd` 状态

#### 4.1.5 退出登录

- 工作台左上角退出图标（门形 SVG）
- 点击 → `localStorage.removeItem('teacher_token')` → App.tsx 清空 token → 返回登录页
- **无二次确认弹窗**（当前版本直接退出）

---

### 4.2 左侧面板

固定宽度 380px，背景色 `#fdf8f5`，包含以下区块（从上到下）：

#### 4.2.1 教师信息区（TeacherInfo）

| 元素 | 说明 |
|------|------|
| 头像 | 圆形，显示姓名首字，橙色背景 |
| 姓名 | 教师全名 |
| "今日带教 X 人" | 文字链接，点击打开 TaskModal（pendingClass 任务列表） |
| 退出图标 | 右侧，门形 SVG，点击退出登录 |

#### 4.2.2 任务网格（TaskGrid）

2列 × 3行，共 6 个任务卡片：

| 位置 | 任务 key | 显示名 | 强调色 |
|------|---------|--------|--------|
| 1 | pendingClass | 待上课 | 默认 |
| 2 | pendingReview | 待批改 | 红色 |
| 3 | newStudent | 新增学员 | 默认 |
| 4 | pendingAssign | 待分配 | 默认 |
| 5 | pendingLink | 待上传链接 | 默认 |
| 6 | pendingHandout | 待上传讲义 | 默认 |

**交互**：
- 点击卡片 → `store.openTaskModal(taskKey)`
- pendingReview → 打开 ReviewModal（独立实现）
- abnormalUser → 打开 AbnormalModal（独立实现）
- 其他 → 打开通用 TaskModal

**数量来源**：`store.taskCounts`，初始加载时从 `GET /api/teacher/tasks/count` 获取，每 30 秒刷新

#### 4.2.3 消息标签（MessageTabs）

4 个等宽标签，点击切换 `store.leftMessageTab`：

| Key | 显示名 |
|-----|--------|
| yesterdayUnreplied | 昨日未回 |
| abnormalUsers | 异常用户 |
| todayMessages | 今日消息 |
| complaints | 投诉 |

**样式**：激活 tab 底部橙色下划线，文字变橙色

#### 4.2.4 聊天列表（ChatList）

**当 tab === 'abnormalUsers' 时**：
- 渲染两个分组：诊断课异常学生 / 卡点课异常学生
- 每个卡片：头像 + 名字 + 年级科目 + 两个操作按钮（联系跟进 / 移交学管）
- "联系跟进" → `store.selectContact(contactId)` + rightTab 切换为 chat
- "移交学管处理" → 有确认逻辑，执行后更新学生状态

**当其他 tab 时**：
- 渲染 `contactsByTab[tab]` 的联系人列表
- 每个 ChatListItem 显示：
  - 头像（颜色背景 + 首字）
  - 名字
  - 投诉标签（tag === 'complaint' 时显示红色"投诉"角标）
  - 消息预览（最后一条消息截断）
  - 时间
  - 未读计数（红色圆形，超过 99 显示"99+"）
- 点击 → `store.selectContact(contactId)` → rightTab 切换为 chat

---

### 4.3 任务模块

#### 4.3.1 通用 TaskModal

**触发**：点击 TaskGrid 中非批改/异常类任务卡片

**弹窗结构**：
- 顶部标题（任务名称）+ 关闭按钮（✕）
- 任务列表（可滚动）
- 每行任务：头像 + 名字 + 副标题 + 操作按钮

**各任务类型操作逻辑**：

| 任务 Key | 操作按钮 | 点击动作 |
|---------|---------|---------|
| pendingClass | 查看学生 | 打开 StudentDetailView |
| pendingLink | 上传链接 / 上传回放 | 打开对应 UploadModal |
| pendingHandout | 上传讲义 | 打开 UploadHandoutModal |
| newStudent | 分配学员 | 打开 AssignStudentModal |
| pendingAssign | 分配学员 | 打开 AssignStudentModal |

#### 4.3.2 ReviewModal（待批改）

**结构**：
- 顶部筛选栏：全部 / 入学诊断 / 卡点练习题 / 卡点考试 / 整卷批改
- 排序规则：紧急 → 普通 → 宽松（按 priority 字段）
- 每项显示：
  - 左侧优先级圆点（紧急=橙色，普通=灰色，宽松=绿色）
  - 学生名 + 评审类型标签 + 卡点名称
  - 截止时间 + 优先级文字
  - 右侧两个按钮：提醒 + 去批改

**提醒功能**：
- 点击"提醒"→ 弹出 Popover（定位在按钮旁）
- 选项：10 / 30 / 60 / 120 分钟后提醒
- 调用浏览器 `Notification API`（需用户授权）
- 若未授权，提示"请允许通知权限"

**去批改**：
- 点击 → 关闭 ReviewModal → 打开 GradingWorkspace（嵌入式工具）

#### 4.3.3 AbnormalModal（异常用户管理）

**结构**：
- 异常学生卡片列表
- 每张卡片：
  - 风险等级徽章（高风险红色 / 关注中橙色）
  - 异常原因 + 图标
  - "展开/收起"按钮 → 显示异常记录时间线
  - 操作：联系跟进 / 移交学管处理

**移交处理**：
- 点击"移交学管处理"→ 二次确认弹窗
- 确认后更新学生状态为"处理中"

---

### 4.4 日程模块（CalendarView）

#### 4.4.1 视图模式

支持 3 种视图，顶部切换按钮：

| 视图 | 说明 |
|------|------|
| 月视图 | 显示整月日历格，有事件的格子显示彩色小点/标签 |
| 周视图 | 显示 7 天列，每列按时间段显示事件块 |
| 日视图 | 显示当天 24 小时时间轴，精细到小时 |

**今日导航**："今天"按钮快速跳回当日；左右箭头切换月/周/日

#### 4.4.2 事件类型

| 类型 | 颜色 | 说明 |
|------|------|------|
| class | 橙色系 | 上课 |
| meeting | 蓝色系 | 会议/腾讯会议 |
| other | 灰色 | 其他 |

#### 4.4.3 创建事件

**触发方式**：
- 双击日历格
- 点击右上角"+ 新增"按钮

**EventFormModal 字段**：

| 字段 | 类型 | 验证规则 |
|------|------|---------|
| 标题 | 文本输入 | 必填，不能为空 |
| 日期 | 日期选择 | 必填 |
| 开始时间 | 时间选择 | 必填 |
| 结束时间 | 时间选择 | 必填，需晚于开始时间 |
| 类型 | 单选（class/meeting） | 默认 class |
| 关联学生 | 下拉选择 | 可选 |

**提交**：
- 调用 `store.addCalendarEvent()` → `POST /api/teacher/calendar`
- 成功后列表实时更新，无需刷新页面

#### 4.4.4 编辑 / 删除事件

- 点击已有事件 → 打开 EventFormModal（预填数据）
- 表单内有"删除"按钮 → 二次确认 → `store.deleteCalendarEvent()`

#### 4.4.5 提醒设置

- 事件创建后可设置提醒：不提醒 / 5 / 15 / 30 / 60 / 120 分钟前
- 依赖浏览器 Notification API，需用户授权

#### 4.4.6 请假标记

- 支持标记日期范围为"请假"
- 请假区间在日历上灰色展示
- 可关联需要重新安排的课次

---

### 4.5 聊天模块（ChatView）

#### 4.5.1 触发条件

- 左侧 ChatList 点击任意联系人
- StudentsView 中点击"进入对话"
- 只有 `store.selectedContactId !== null` 时才渲染 ChatView；否则显示 OverviewView（聊天总览）

#### 4.5.2 页面结构

```
┌─────────────────────────────────┐
│ 顶部：联系人名称 + 日期选择器      │
├───────────────────┬─────────────┤
│                   │             │
│  消息列表          │  右侧工具栏  │
│  （可滚动）        │  学生信息卡  │
│                   │  群成员管理  │
│                   │  添加笔记    │
│                   │             │
├───────────────────┴─────────────┤
│ 底部输入区：文本框 + 发送 + 文件   │
└─────────────────────────────────┘
```

#### 4.5.3 日期选择器

- 月日历展开，有消息的日期高亮显示橙色点
- 点击日期跳转到该日消息
- 今日有特殊指示符

#### 4.5.4 消息列表

**按日期分组**，每组顶部显示日期分隔线

**消息气泡显示**：
- 发送者名字 + 角色徽章（带教老师/学管/校长等，各角色对应颜色）
- 消息内容（根据类型）：

| 消息类型 | 渲染方式 |
|---------|---------|
| text | 纯文字气泡 |
| image | 缩略图，点击可查看大图 |
| file | 文件图标 + 文件名 + 文件大小 + 下载按钮 |
| audio | 音频波形图标 + 时长（秒） |

- 回复消息：在气泡上方显示灰色引用框（原消息发送者 + 内容摘要）
- 消息时间戳（HH:mm）

#### 4.5.5 消息输入区

| 元素 | 功能 |
|------|------|
| 文本框 | 多行输入，Enter 发送（Shift+Enter 换行） |
| 发送按钮 | 点击发送文字 |
| 文件按钮 | 选择文件上传 |

#### 4.5.6 右侧工具栏

**学生信息卡**（仅联系人为学生时显示）：
- 学生头像、名字、状态标签、年级、科目
- "查看详情"按钮 → 打开 StudentDetailView

**管理群成员**：
- 点击 → 打开 ManageMembersModal
- 列出当前群的所有成员（按角色分组）
- 可添加成员（选择角色+姓名）
- 可删除成员（成员右侧删除按钮）

**添加笔记**：
- 点击 → 打开 NotesModal
- 显示该联系人的全部笔记列表（时间倒序）
- 每条笔记：作者 + 时间 + 内容 + 删除按钮
- 底部输入框添加新笔记 → `store.addNote()`

---

### 4.6 学生管理模块（StudentsView）

#### 4.6.1 角色切换

顶部两个按钮：**老师** / **学管**

| 身份 | 显示标签页 |
|------|---------|
| 老师 | 我的带教 / 我的诊断 |
| 学管 | 诊断学员 / 卡点学员 |

#### 4.6.2 学生列表

**学生卡片内容**：
- 头像（颜色圆形 + 首字）
- 姓名 + 状态标签（normal/abnormal/new/leave）
- 年级 + 科目
- 最近上课时间
- 点击 → 导航到 StudentDetailView

**状态标签颜色**：

| 状态 | 显示文字 | 颜色 |
|------|---------|------|
| normal | 正常 | 绿色 |
| abnormal | 异常 | 红色 |
| new | 新学员 | 蓝色 |
| leave | 请假中 | 橙色 |

#### 4.6.3 StudentDetailView（学生详情页）

**导航**：学生列表 → 学生详情（有返回按钮）

**顶部信息栏**：

| 元素 | 说明 |
|------|------|
| 返回按钮 | 返回学生列表 |
| 头像 | 点击（若有 contactId）跳转到该学生的聊天界面 |
| 姓名 + 重点关注标签 | 已标记为重点关注时显示红色星形标签 |
| 年级 · 科目 | |
| 入学日期 / 累计课次 / 累计学时 | 三列数据 |

**Tab 切换**：学习档案 / 学习内容

---

##### 学习档案 Tab

**区块一：请假信息**（如有请假则显示）
- 橙色边框卡片
- 字段：请假开始 / 请假结束 / 请假原因 / 预计复课日期

**区块二：学习进度**

子标签切换：**卡点课** / **诊断课**

**卡点课**（正常视图）：
- 每个步骤一行，含：
  - 编号圆圈（颜色代表状态）
  - 步骤名称
  - 状态标签（已正常完成 / 延期完成 / 急需完成 / 待完成）
  - 展开箭头（点击展开讲义/回放/作答）
- 底部"管理进度"按钮

**卡点课**（管理进度模式）：
- 标题"管理课程进度" + 总步骤数
- 每步：编号 + 文本输入框（可改步骤名）+ 4个状态选择按钮 + 删除按钮
- 底部"添加步骤"按钮（虚线按钮）
- 操作栏：取消 / 保存
- 保存后恢复正常视图，步骤以自定义数据显示

**展开区域（每个步骤）**：
- 课程讲义：显示该 DAY 关联的讲义列表（文件名 + 日期）；无则显示"暂无讲义"
- 学习回放：显示关联回放链接（点击跳转）+ 时长 + 日期；无则显示"暂无回放"
- 题目作答：列出所有答题记录（题型标签 + 题目名 + 分数/待批改）

**诊断课**（固定6步，不可自定义）：
- 步骤：建立专属诊断群 / 1V1 电话沟通 / 诊断试卷 / 听解析 / 1V1 诊断课 / 诊断报告
- 状态：已完成 / 当前 / 待完成（根据 currentDiagStep 判断）
- 当前步骤的限制说明（如"3天内完成"）可在编辑模式下修改
- 编辑图标点击 → inline 文本框修改限制说明 → 保存/取消

**区块三：相关信息**

- 信息卡片列表（时间倒序）
- 每条：角色徽章 + 作者 + 时间 + 内容 + 删除按钮
- "+ 新增信息"按钮 → 展开表单：
  - 角色选择（带教老师/诊断老师/学管/校长/销售/其他）
  - 作者姓名输入
  - 内容 textarea
  - 保存按钮

**区块四：投诉记录**

- 投诉卡片列表（显示状态：待处理/已解决）
- "+ 新建投诉"按钮 → 打开 ComplaintModal

---

##### 学习内容 Tab

**学习目标**：
- 卡点课的 learningObjectives 列表（序号 + 内容）

**DAY 步骤列表**：
- 每个 DAY 一张卡片，边框颜色对应状态（绿/橙/橙红/白）
- 卡片头部：DAY编号 + 主任务名 + 附加任务标签 + 状态文字 + "编辑"按钮
- 卡片内容（根据任务类型）：

| 任务类型 | 内容展示 |
|---------|---------|
| 1v1课（共识/纠偏） | 腾讯会议录播状态 |
| 理论课 | 理论课视频状态 + 课程讲义状态 |
| 刷题 | 第一个刷题DAY显示完整题目分配列表（可勾选分配）；后续刷题DAY显示"同DAY{n}题目继续练习" |
| 考试 | 考题/考试讲义/解析视频/解析讲义的上传状态 |

- 已保存备注（若有）显示在卡片底部

**编辑弹窗**（点击卡片"编辑"按钮）：
- 标题：修改学习任务 · DAY{n} · {步骤名}
- 若是刷题类型：显示完整题目多选列表（可调整分配）
- 备注/自定义说明：textarea
- 底部：取消 / 确认修改

---

### 4.7 批改工作台（GradingWorkspace）

**触发**：ReviewModal 中点击"去批改"

**工具栏**：

| 工具 | 说明 |
|------|------|
| 指针 | 默认模式，不绘制 |
| 文字 T | 点击 PDF 上方放置文本注解 |
| 画笔 | 自由绘制路径 |
| 下划线 | 拖拽绘制直线 |
| 橡皮 | 点击删除最近的笔画 |

**颜色选择**：7种颜色（红/橙/黄/绿/蓝/紫/黑）

**笔宽**：细 / 中 / 粗（3档）

**撤销**：撤销最后一步操作

**PDF 支持**：
- 使用 pdfjs-dist 加载 PDF 文件
- Canvas 覆盖层用于绘制注解
- 支持多页浏览（上一页/下一页）

**评分面板**（右侧）：
- 学生得分（数字输入，0-100）
- 等级选择（优/良/中/差）
- 批改意见（textarea）
- 保存按钮 → 调用批改接口，标记为已批改

---

### 4.8 分配学员（AssignStudentModal）

**4步流程**，步骤指示器显示当前进度：

#### 步骤 1：选择版本

3个版本卡片：

| 版本 | 天数 | 说明 |
|------|------|------|
| 标准版 | 7天 | 全面学习 |
| 极速版 | 3-4天 | 快速通关 |
| 尊享版 | 3-4天 | 精品定制 |

每张卡片显示：价格 / 适用人群 / 权益列表

点击选中（橙色边框高亮）

#### 步骤 2：选择卡点课程

- 下拉或列表选择 CheckpointContent
- 自动预选 `selectionType === 'default'` 的题目
- 每个卡点显示名称 + 标准路径天数

#### 步骤 3：选择题目

- 多选题目列表（勾选/取消勾选）
- 每题显示：序号 + 类型标签（默认/补弱/手动）+ 题目名
- 右上角显示"已选 X / 总 Y"

#### 步骤 4：选择考试

- 多选考试列表

#### 确认提交

- 所有步骤均完成才能点击"确认"（否则按钮置灰）
- 提交后 → `store.setStudentPracticeAssignment()` 保存分配
- 显示成功提示（绿色 toast 或 inline）

---

### 4.9 投诉管理（ComplaintModal）

**5步向导**：

| 步骤 | 字段 | 验证 |
|------|------|------|
| 1 | 学生诉求（textarea） | 必填 |
| 2 | 投诉原因（textarea） | 必填 |
| 3 | 解决建议（textarea）+ 解决人多选 | 建议必填；解决人从群成员中提取（非学生角色） |
| 4 | 截止时间（date input） | 必填，不能早于今日 |
| 5 | 附件（文件上传，支持多个） | 可选 |

**上一步/下一步**导航；最后一步显示"提交"按钮

**提交后**：
- 记录存入 `store.complaintsMap`
- 显示成功反馈

**已有投诉**：可在 StudentDetailView 中查看列表，状态分为"待处理"和"已解决"；点击可标记为已解决（填写解决备注）

---

## 5. 全局状态管理

使用 **Zustand** 管理全局状态，store key：`useWorkbenchStore`

### 5.1 核心状态分类

| 分类 | 主要字段 |
|------|---------|
| UI 状态 | `leftMessageTab` `rightTab` `openTaskKey` |
| 联系人 | `selectedContactId` `lastContactId` |
| 日历 | `calendarEvents` |
| 学生 | `students` `studentInfoMap` `flaggedMap` |
| 笔记 | `notesMap` `studentDayNotes` |
| 聊天 | `privateSessions` `privateMsgMap` |
| 投诉 | `complaintsMap` |
| 上传 | `linkUploadItem` `handoutUploadItem` `replayUploadItem` |
| 任务 | `taskCounts` |
| 练习分配 | `studentPracticeAssignments` |

### 5.2 数据初始化

TeacherWorkbench 挂载时执行（useEffect）：
1. `loadCalendarEvents()` → GET /api/teacher/calendar
2. `loadTaskCounts()` → GET /api/teacher/tasks/count
3. `loadStudents()` → GET /api/teacher/students

定时刷新（每 30 秒）：
- `loadCalendarEvents()`
- `loadTaskCounts()`

### 5.3 数据降级策略

当 API 请求失败时：
- 日历、任务计数 → 保持上次数据（不清空）
- 学生列表 → 使用真实接口数据（当前版本）
- 聊天消息 → 使用真实接口 / WebSocket 数据（当前版本）

---

## 6. 数据验证规则

### 6.1 登录/注册

| 字段 | 规则 | 错误提示 |
|------|------|---------|
| 邮箱 | 非空；浏览器 email 格式校验 | "请填写完整信息" |
| 密码 | 非空 | "请填写完整信息" |
| 姓名（注册） | 非空 | "请输入姓名" |
| 密码（注册） | 长度 ≥ 6 | "密码至少 6 位" |
| 确认密码（注册） | 与密码相同 | "两次密码不一致" |

### 6.2 事件创建

| 字段 | 规则 |
|------|------|
| 标题 | 非空 |
| 日期 | 非空 |
| 开始/结束时间 | 非空；结束 > 开始 |

### 6.3 批改评分

| 字段 | 规则 |
|------|------|
| 分数 | 整数；0 ≤ score ≤ 100 |
| 非数字 | 不允许提交（按钮 disabled） |

### 6.4 投诉表单

| 字段 | 规则 |
|------|------|
| 学生诉求 | 非空 |
| 投诉原因 | 非空 |
| 截止时间 | 非空；不早于今日 |

### 6.5 添加学生信息

| 字段 | 规则 |
|------|------|
| 内容 | 非空（trim 后非空才能提交） |

---

## 7. 错误处理与边界条件

### 7.1 网络错误

| 场景 | 处理方式 |
|------|---------|
| 登录失败（网络断开） | 红色 inline 错误"无法连接到服务器，请确认后端已启动" |
| API 调用失败 | try-catch 捕获，保持当前状态不清空（静默失败） |
| 文件加载失败 | PDF viewer 显示加载失败提示 |

### 7.2 空数据边界

| 场景 | 处理方式 |
|------|---------|
| 无学生数据 | 显示"暂无学生" |
| 无聊天消息 | 显示空白（无提示） |
| 无讲义/回放 | 显示"暂无讲义" / "暂无回放" |
| 无作答记录 | 显示"暂无作答记录" |
| 该学科无卡点配置 | 显示"该卡点暂无内容配置" |
| 卡点课步骤为空 | 学习档案不显示该卡点课区块 |

### 7.3 浏览器 Notification API

- 首次使用提醒功能时请求权限
- 用户拒绝 → alert 提示"请允许通知权限以使用提醒功能"
- 不影响其他功能使用

### 7.4 投诉附件

- 文件上传当前转为 base64 本地预览存储（待后端持久化版本）
- 无大小限制（当前版本）
- 支持多个文件

### 7.5 卡点课进度管理

- 删除步骤时若只剩 1 步，删除按钮 disabled（至少保留 1 步）
- 步骤名输入框为空时仍可保存（不强制验证）

---

## 8. 界面状态定义

### 8.1 加载状态

| 组件 | 加载中 | 加载完成 |
|------|--------|---------|
| 登录按钮 | 显示旋转图标 + "登录中…" / "注册中…"；按钮 disabled | 恢复文字 |
| 学生信息保存 | 按钮变灰 + 文字"保存中…" | 恢复 |
| PDF 加载 | Loading 遮罩 | 渲染 PDF Canvas |

### 8.2 空状态

各列表组件在数据为空时显示对应占位文本（见 7.2）

### 8.3 选中状态

| 组件 | 选中样式 |
|------|---------|
| ChatListItem | 橙色左边框 + 浅橙背景 |
| MessageTabs | 底部橙色下划线 + 橙色文字 |
| TaskCard | 无选中态（点击即打开 modal） |
| StudentsView Tab | 橙色背景 + 白色文字 |
| 版本卡片（AssignStudent） | 橙色边框 |
| 题目勾选 | 橙色边框 + 浅橙背景 + 白色勾选框 |

### 8.4 禁用状态

| 组件 | 条件 | 样式 |
|------|------|------|
| 登录/注册按钮 | loading=true | opacity-50 |
| 批改提交按钮 | 分数为空 | opacity-40 |
| AssignStudent 确认 | 有未完成步骤 | opacity-40 |
| 删除步骤按钮 | 步骤数 ≤ 1 | opacity-30 |

---

## 9. 用户体验细节

### 9.1 动画与过渡

| 元素 | 动画 |
|------|------|
| MessageTabs 激活 | 边框颜色 transition-colors 150ms |
| 展开/收起箭头 | rotate-180 transition-transform |
| 知识点展开 | 自然展开（无 height 动画，直接显示） |
| 进度条 | transition-all duration-500 |
| 按钮 hover | transition-colors 150ms |
| 加载旋转 | animate-spin |

### 9.2 字体规范

- 根节点 `font-size: 120%`（全局放大）
- 标题类：`text-sm` / `text-xs font-semibold`
- 正文：`text-xs` / `text-sm`
- 辅助信息：`text-[10px]` / `text-[11px]`
- 颜色：主文字 `#1a1205`；次要 `#5c5248`；辅助 `#9a8e87`

### 9.3 布局规范

- 左侧面板：固定宽度 `380px`（CSS 变量 `--left-width`）
- 右侧面板：弹性宽度（flex-1）
- 模态框：最大宽度 480px（通用）/ 宽度自适应（GradingWorkspace 宽屏）
- 圆角：卡片 `14px`（CSS 变量 `--radius-card`）

### 9.4 颜色规范

| 变量 | 色值 | 用途 |
|------|------|------|
| --color-primary | #e8845a | 主题橙色 |
| --color-primary-dark | #c96a3e | 深橙（按钮 hover） |
| --color-primary-light | #fff0e8 | 浅橙（背景/选中） |
| --color-bg-left | #fdf8f5 | 左侧面板底色 |
| --color-border | #edddd4 | 边框 |
| --color-badge-alert | #d94f35 | 告警红 |

### 9.5 滚动行为

- 左侧面板聊天列表：独立滚动区域
- 右侧内容区：独立滚动区域
- 模态框内容区：`max-h-[80vh]` + `overflow-auto`
- 消息列表：底部对齐，新消息自动滚动到底部

### 9.6 响应式

**当前版本为 PC 端固定布局**，不支持移动端适配（左侧面板 380px 固定宽度，屏幕宽度建议 ≥ 1024px）

---

## 10. 数据结构总览

```typescript
// 联系人
interface ContactItem {
  id: string
  name: string
  avatar: string        // 显示文字（通常是姓名首字）
  color: string         // 头像背景色
  preview: string       // 最后消息预览
  time: string          // 最后消息时间
  unreadCount: number
  tag?: 'complaint'
  contactType?: 'student' | 'colleague'
}

// 任务项
interface TaskListItem {
  id: string
  name: string
  subtitle: string
  actionLabel: string
  avatar: string
  color: string
  contactId?: string
  tmLink?: string
  studentId?: string
  eventId?: string
  linkType?: 'class' | 'replay'
}

// 日历事件
interface CalEvent {
  id: string
  date: string          // YYYY-MM-DD
  startTime: string     // HH:mm
  endTime: string       // HH:mm
  title: string
  type: 'class' | 'meeting'
  link?: string
}

// 聊天消息
interface ChatMessage {
  id: string
  contactId: string
  sender: GroupRole
  senderName: string
  text: string
  time: string          // HH:mm
  date?: string         // YYYY-MM-DD
  recalled?: boolean
  replyTo?: { id: string; senderName: string; text: string }
  msgType?: 'text' | 'image' | 'file' | 'audio'
  fileUrl?: string
  fileName?: string
  fileSize?: string
  audioDuration?: number
}

// 学生
interface StudentItem {
  id: string
  name: string
  avatar: string
  color: string
  grade: string
  subject: string
  status: 'normal' | 'abnormal' | 'new' | 'leave'
  contactId?: string
  lastSession?: string
}

// 学生相关信息条目
interface StudentInfoItem {
  id: string
  studentId: string
  authorName: string
  authorRole: string
  content: string
  createdAt: string     // ISO 8601
}

// 投诉记录
interface ComplaintRecord {
  id: string
  studentId: string
  studentName: string
  demand: string
  reason: string
  suggestion: string
  resolvers: string[]
  deadline: string      // YYYY-MM-DD
  attachments: ComplaintAttachment[]
  submittedBy: string
  submittedAt: string   // ISO 8601
  status: 'pending' | 'resolved'
  resolvedAt?: string
  resolvedNote?: string
}

// 卡点内容
interface CheckpointContent {
  id: string
  name: string
  standardPath: string[]         // ["DAY1 共识课", "DAY2 理论课", ...]
  learningObjectives: string[]
  theoryVideoId?: string
  theoryHandoutPdf?: string
  practiceQuestions: PracticeQuestion[]
  examTitle?: string
  examHandoutPdf?: string
  examVideoId?: string
  examAnalysisPdf?: string
}

// 群成员角色
type GroupRole = '带教老师' | '学管' | '校长' | '诊断老师' | '学生'

// 任务 Key
type TaskKey = 
  'pendingClass' | 'pendingReply' | 'abnormalUser' |
  'pendingReview' | 'pendingAssign' | 'pendingLink' |
  'newStudent' | 'pendingHandout'

// 消息 Tab
type MessageTabKey = 
  'yesterdayUnreplied' | 'abnormalUsers' | 
  'todayMessages' | 'complaints'

// 右侧 Tab
type RightTabKey = 'schedule' | 'chat' | 'students' | 'overview' | 'scheduling'
```

---

## 11. 后端接口清单

### 认证

| 方法 | 路径 | 参数 | 返回 | 状态 |
|------|------|------|------|------|
| POST | /api/auth/teacher/register | `{ name, email, password }` | `{ token, name, id }` | ✅ 已实现 |
| POST | /api/auth/teacher/login | `{ email, password }` | `{ token, name, id }` | ✅ 已实现 |

### 教师

| 方法 | 路径 | 返回 | 状态 |
|------|------|------|------|
| GET | /api/teacher/tasks/count | `{ pendingClass, pendingGrade, newStudents, abnormal }` | ✅ 已实现 |
| GET | /api/teacher/students | 学生列表数组 | ✅ 已实现 |
| GET | /api/teacher/students/abnormal | 异常学生列表 | ✅ 已实现 |
| GET | /api/teacher/students/:id/info | `{ notes, flagged, courses }` | ✅ 已实现 |
| POST | /api/teacher/students/:id/notes | `{ content }` | ✅ 已实现 |
| DELETE | /api/teacher/notes/:noteId | - | ✅ 已实现 |
| PUT | /api/teacher/students/:id/flag | `{ flagged, reason, severity }` | ✅ 已实现 |
| GET | /api/teacher/calendar | 日历事件数组 | ✅ 已实现 |
| POST | /api/teacher/calendar | `{ title, date, start_time, end_time, type, student_id }` | ✅ 已实现 |
| PUT | /api/teacher/calendar/:eventId/link | `{ link }` | ✅ 已实现 |
| DELETE | /api/teacher/calendar/:eventId | - | ✅ 已实现 |
| GET | /api/teacher/contacts/:contactId/notes | 笔记数组 | ✅ 已实现 |
| POST | /api/teacher/contacts/:contactId/notes | `{ text }` | ✅ 已实现 |
| DELETE | /api/teacher/contact-notes/:noteId | - | ✅ 已实现 |

### 批改

| 方法 | 路径 | 状态 |
|------|------|------|
| GET | /api/submissions | ✅ 已实现（路由文件存在） |
| GET | /api/submissions/file/:id | ✅ 已实现 |
| POST | /api/submissions/:id/grade | ⚠️ 待确认 |

### 待开发接口

| 优先级 | 功能 | 建议接口 |
|--------|------|---------|
| 高 | 分配学员（新增 teacher_students） | POST /api/teacher/students/:id/assign |
| 高 | 查询已分配学员 | GET /api/teacher/students |（扩展返回字段）|
| 中 | 投诉记录存储 | POST/GET /api/teacher/complaints |
| 中 | 消息聚合（今日消息/昨日未回） | GET /api/teacher/messages/summary |
| 低 | 卡点课进度自定义保存 | PUT /api/teacher/students/:id/cp-steps |
| 低 | 讲义/回放文件上传（真实存储） | POST /api/teacher/upload |

---

## 12. 未完成 / 待规划

### 已实现但待对接真实数据

| 功能 | 当前状态 |
|------|---------|
| 学生列表 | 真实接口数据 |
| 聊天消息 | 真实接口 + WebSocket 数据 |
| 任务列表 | 真实接口数据 |
| 投诉管理 | 前端状态存 Zustand，未持久化到数据库 |
| 练习题分配 | 前端状态存 Zustand，未持久化到数据库 |
| 卡点课进度 | 前端状态存 Zustand，未持久化到数据库 |

### 功能尚未实现

| 功能 | 说明 |
|------|------|
| 忘记密码 | 暂无密码重置流程 |
| 管理员创建账号 | 只能自行注册，无管理后台 |
| 真实文件上传 | 讲义/回放使用 base64 或 URL，未做文件服务 |
| 移动端适配 | 固定 380px 左侧，不适配小屏 |
| 多语言 | 当前仅中文 |

### v1.0 → v1.1 之间已补齐（不在 v1.0"功能尚未实现"清单里但实际可用）

| 功能 | 状态 |
|------|------|
| 消息推送（WebSocket） | ✅ 已接入，带 ack 计时器与 HTTP 回退兜底 |
| 总览页（OverviewView） | ✅ 已启用，绑定到右侧"总览" Tab |
| 排课功能（TeacherScheduleBoard） | ✅ 已实现：月/周/日切换、新增/调课/删除 |

---

## 13. 改造日志（v1.0 → v1.1）

2026-08 大改造已完成 2 阶段（基础设施 + 高危 bug 清剿），`tsc -b` 与 `eslint` 均 0 错误 0 警告，`vite build` 通过。

### 13.1 新增基础设施（`src/lib/` + `src/hooks/` + 部分 `components/ui/`）

| 模块 | 作用 |
|------|------|
| `lib/logger.ts` | 分级日志（debug/info/warn/error）+ 500 条环形缓冲 + `window.__WORKBENCH_LOGS__.entries()/export()/setLevel()` |
| `lib/auth.ts` | 统一 token 读写与 JWT 解析（base64url 归一化 + TextDecoder 解中文），修复原有 `atob` 对中文 payload 失效问题 |
| `lib/http.ts` + `lib/api.ts` 门面 | 15s 超时、HTML 防御、`ApiError` 分类（timeout/network/html/http/parse）、401 自动 `clearToken` + `AUTH_EXPIRED_EVENT`、postForm 走同一核心 |
| `lib/datetime.ts` | 本地时区工具 `toDateKey`/`dateKeyOf`/`formatDate*`/`weekStart(weekStartsOn:1)`，根治 `toISOString().slice(0,10)` 在 UTC+8 凌晨 0-8 点差一天 |
| `lib/color.ts` | 唯一调色板（`AVATAR_COLORS` 8 色 + `TEACHER_COLORS` 6 色）与 `colorFromName`/`teacherColorFromName` |
| `hooks/useSubmitState.ts` | 提交三件套（submitting/error/run）+ 自动关闭定时器清理 |
| `components/ui/toast.tsx` + `toastCore.ts` | 命令式 toast，替代散落各处的 `alert()` |
| `components/ui/AppField` / `AppEmptyState` / `AppAvatar` / `AppStatusTag` | 原子 UI 组件 |

### 13.2 关键 bug 修复

| 类别 | 修复 |
|------|------|
| 崩溃级 | `ManageMembersModal` 与 `LearningPathPanel` 的两处 Rules of Hooks 违规 |
| 聊天 | 轮询快照丢消息改合并式写入；ack 超时 HTTP 回退带 clientId 让服务端幂等；发送失败标红 + 点击重发；WS 连接状态可见；房间消息 300 条上限 |
| 乐观更新 | 日程增删改 / 笔记 / 跟踪记录 / 学生标记全部改为"先写 store + 调 API + 失败快照回滚 + toast"，告别假成功 |
| 上传 | 三处静默失败补 catch；jpeg 白名单统一；弹窗状态泄漏清理；自动关闭定时器清理 |
| 多步提交 | 诊断两步提交失败保留弹窗可重试；分配学员 fail-fast + 已分配防重复 |
| 日期 | 全部 UTC→本地时区；`Date.now()` id → `crypto.randomUUID()` |
| 轮询 | 失败不再清空数据只告警；登录后 `syncTeacherName` 修复 store 创建早于登录的固化空串 |
| 复位 | 新增 `resetWorkbench()`：登出/401 清 store + 断 WS，换号不再闪现上一账号数据 |
| 交互 | CalendarView 点击错位；排课看板加载竞态；表情选择器 portal ref 错（点不开） |

### 13.3 清理

- `alert()` 全换 toast
- 乱码注释与 `\u` 转义全清
- 总览页（OverviewView）启用并修完请求风暴/`Date.now` 纯度/同名误判
- 死代码删除；失分点定义移入 `config/`
- tsc / eslint / vite build 三道闸全部通过

### 13.4 已知遗留

| 项 | 说明 |
|---|---|
| `CheckpointReportEditor`（1070 行） | 未接线的备用编辑器，按决策保留不删 |
| 生产构建 chunk 体积警告 | pdfjs worker 1.2MB + 3 张报告底图打包内，预存在，不影响功能 |
| `privateSessions` 等私聊 mock 状态 | 按决策保留并标 TODO 待接后端 |
| God store（`workbenchStore.ts` ~1140 行） | 单一 Zustand store 暂未按域拆 slices，已铺好 `createState` 工厂便于后续拆分 |

---

*v1.1 · 2026-08-26 · 同步改造后实际状态*
