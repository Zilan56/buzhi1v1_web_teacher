# 带教老师工作台 · 教师端

> 内部使用的带教老师 PC 端工作台，集中处理任务、日程、聊天、学生管理与批改。
>
> 前端仓库：教师工作台（teacher-workbench）
> 对应后端：[student-teacher-fastapi](https://github.com/.../student-teacher-fastapi) （FastAPI，本仓库不包含）

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | React 19 + TypeScript |
| 构建 | Vite 8 |
| 样式 | Tailwind CSS 4 |
| 状态 | Zustand 5 |
| 日期 | date-fns 4 |
| PDF | pdfjs-dist 5 |
| 代码检查 | ESLint 9 + typescript-eslint + react-hooks |

> **不引入** UI 组件库（Ant Design / Material UI 等）；使用自维护的 `components/ui/` 原子组件，避免重复收束后样式走样。

---

## 快速开始

### 环境要求

- Node.js ≥ 20
- 后端服务运行中（见 `.env.development`）

### 安装与启动

```bash
npm install
npm run dev          # 启动开发服务（监听 0.0.0.0:5173，局域网可访问）
```

`npm run dev` 通过 Vite proxy 将 `/api` 和 `/uploads` 转发到 `.env.development` 中的 `VITE_API_BASE_URL`（默认 `http://localhost:3000`）。

### 常用脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务 + HMR |
| `npm run build` | 类型检查 + 生产构建（`tsc -b && vite build`） |
| `npm run lint` | 全量 ESLint |
| `npm run preview` | 预览生产构建产物 |

---

## 环境变量

通过 `.env.development`（开发）和 `.env.production`（生产）注入 `VITE_*` 变量，运行时由 Vite 内联到代码中。`.env.example` 给出了默认值：

```bash
VITE_API_BASE_URL=https://apix.1v1.buzhi.com   # 默认生产后端
# 开发环境切回本地：
# VITE_API_BASE_URL=http://localhost:3000
```

仅这一个变量。鉴权、token、业务字段一律走后端返回，不在前端硬编码。

---

## 项目结构

```
src/
├── lib/                          # 基础设施层（所有代码可依赖，禁止依赖业务）
│   ├── api.ts                    # HTTP 门面（api.get/post/put/delete/postForm/getBlob）
│   ├── auth.ts                   # token 读写 + JWT 解析（base64url + 中文安全）
│   ├── color.ts                  # 统一调色板 + colorFromName
│   ├── datetime.ts               # 本地时区日期工具（toDateKey/dateKeyOf/formatDate…）
│   ├── http.ts                   # fetch 核心（超时/HTML 防御/401 自动登出/ApiError）
│   ├── logger.ts                 # 分级日志（debug/info/warn/error）+ 环形缓冲
│   └── apiBase.ts                # API_BASE_URL 导出
│
├── hooks/
│   └── useSubmitState.ts         # 提交状态三件套（submitting/error/run + 自动清理）
│
├── components/ui/                # 原子 UI 组件
│   ├── AppButton / AppCard / AppModal / AppTabs / StatusBadge
│   ├── AppField (Input/Textarea/Select)
│   ├── AppEmptyState / AppAvatar / AppStatusTag
│   └── toast.tsx + toastCore.ts  # 命令式 toast
│
├── pages/
│   ├── Login/                    # 登录 + 注册 + 身份设置
│   └── TeacherWorkbench/
│       ├── TeacherWorkbench.tsx  # 根组件 + 30s 全局轮询
│       ├── store/workbenchStore.ts   # 单一 Zustand store（god store，已封装 resetWorkbench）
│       ├── api/                  # 业务 API 模块（chat/learningPath/submissions/reviewOverview）
│       ├── config/               # 配置（launch 开关 / 学习路径 / 任务 / 失分点 / 状态）
│       ├── lib/                  # 业务选择器（chatSelectors/submissionLabels）
│       ├── types.ts              # 业务类型（ChatMessage/CalEvent/StudentItem/...）
│       └── components/
│           ├── LeftPanel/        # 教师信息 / 任务网格 / 消息标签 / 聊天列表 / 各任务弹窗
│           └── RightPanel/       # 日历 / 聊天 / 学生 / 排课看板 / 总览 / 批改概览
│
├── App.tsx                       # 应用入口：LoginPage ↔ AppShell（带 401/超时/重试 UI）
└── main.tsx                      # React 挂载
```

---

## 关键设计

### 基础设施统一

| 问题 | 解决 |
|---|---|
| 多套手写 `fetch` 各自处理 401/超时/HTML 防御 | 统一到 `lib/http.ts` + `lib/api.ts` 门面 |
| JWT 解析 `atob` 对 base64url / 中文失效 | `lib/auth.ts` 统一 base64url 归一化 + TextDecoder |
| `toISOString().slice(0,10)` 在东八区凌晨差一天 | `lib/datetime.ts` 的 `toDateKey`/`dateKeyOf` |
| 多处调色板 + colorFromName 散落 | `lib/color.ts` 唯一出处 |
| `alert()` 与各弹窗自造的 loading/error 状态 | `toast` + `useSubmitState` |
| 前端无日志，关键路径调试只能猜 | `lib/logger.ts`，控制台分级 + `window.__WORKBENCH_LOGS__` 导出 |

### 状态管理

**单一 Zustand store**（`store/workbenchStore.ts`）。模块按状态域分组：UI / 任务 / 日历 / 学生 / 聊天 / 投诉。导出 `useWorkbenchStore` 单一 hook，建议组件使用 selector 订阅而非全量订阅（避免每次轮询重渲染）。

`resetWorkbench()` 是登出 / 401 时的整体复位入口：清空所有数据 + 断开 WS + 重置 UI 状态。换号不会再闪现上一账号的聊天内容。

### 聊天模块

- **消息存储**：`chatMessagesMap: Record<contactId, ChatMessage[]>`，单房间 300 条上限
- **传输**：优先 WebSocket（带 ack 计时器 5s，超时自动走 HTTP 回退，回退请求携带 clientId 以让服务端幂等去重）
- **乐观更新**：发送时立刻渲染 pending 气泡，ack 到达 / 回退成功移除 pending；服务端确认到达但 WS 未回显 / 回退失败 → 标 `failed` 提供"点击重发"
- **连接状态**：header 显示 `已连接 / 连接中 / 重连中 / 已断开`（`wsStatus`）

### 乐观更新与回滚

所有写操作（笔记、跟踪记录、学生标记、日程增删改）采用"先写 store + 调用 API + 失败回滚 + toast 提示"模式。失败时本地状态自动还原，用户能看到清晰的错误且不会被"假成功"误导。

### 轮询策略

`TeacherWorkbench.tsx` 挂载 + 每 30 秒轮询：`calendar / taskCounts / taskItems / students / abnormal / chatContacts / complaints`。**轮询失败只记录日志，不清空已有数据**——空数据对用户来说是更大的干扰。

---

## 调试技巧

### 日志查看

```js
// 在浏览器控制台：
__WORKBENCH_LOGS__.entries()    // 获取环形缓冲中的所有日志条目
__WORKBENCH_LOGS__.export()     // 导出为可下载文件
__WORKBENCH_LOGS__.setLevel('debug')   // 动态调整日志级别
```

日志按子模块前缀（`store`、`poll`、`chat`、`http`、`calendar`、`learningPath`、`review` 等），可在控制台按前缀过滤。

### 常见错误排查

| 现象 | 看哪里 |
|---|---|
| 一直"正在加载老师信息" | 检查 token 是否过期 + 后端 `/api/auth/teacher/profile` 是否 200 |
| 聊天消息发不出去 | 控制台 `chat.send.failed` / `chat.ack.timeout` / `chat.fallback.used` 链路 |
| 日程新增/调课失败 | `calendar.add.failed` / `calendar.update.rollback` |
| 上传静默失败 | 检查 `upload.failed` 来源标记 |

---

## 与后端的契约

本仓库仅是前端。后端字段、状态码、错误体格式有任何变更，需同步修改：

- `src/lib/http.ts` —— ApiError 类型、HTTP 状态码语义、401 处理
- `src/pages/TeacherWorkbench/store/workbenchStore.ts` —— 字段映射
- `src/pages/TeacherWorkbench/types.ts` —— 业务类型

后端仓库当前在改造中（见 PRD.md §12），前端按现有契约编码，不因后端端点暂缺阻塞前端开发。

---

## 当前状态

- ✅ tsc / eslint / vite build 全部通过
- ✅ 主要 bug 修复完成（见 `PRD.md` §12 待办清单已大部分落地）
- ⚠️ `CheckpointReportEditor`（1070 行）是未接线的备用编辑器，暂未挂载
- ⚠️ 生产构建存在 chunk 体积警告（pdfjs worker + 内嵌报告底图），不影响功能

详细功能规格见 [`PRD.md`](./PRD.md)。
