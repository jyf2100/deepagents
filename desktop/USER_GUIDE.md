# Cowork 桌面应用操作手册

## 快速开始

### 安装

1. 下载 DMG 文件（macOS ARM 或 Intel）
2. 将 `Cowork.app` 拖拽到 `应用程序` 文件夹
3. 启动应用

**系统要求**：macOS 11.0+

---

## 首次配置

首次启动需要配置至少一个 AI 服务商的 API Key：

| 服务商 | 支持的模型 | 获取地址 |
|--------|-----------|---------|
| OpenAI | GPT-4、GPT-3.5 | [platform.openai.com](https://platform.openai.com/api-keys) |
| Anthropic | Claude 系列 | [console.anthropic.com](https://console.anthropic.com/) |
| Google | Gemini 系列 | [ai.google.dev](https://ai.google.dev/) |

**配置步骤**：选择服务商 → 填写 API Key → （可选）填写 Base URL → 保存

---

## 界面说明

- **侧边栏**：历史对话、技能管理、设置按钮
- **聊天区域**：工作空间切换器、消息显示、输入框

---

## 功能说明

### 工作空间

工作空间是独立的文件隔离环境，每个工作空间有独立的文件存储、对话历史和系统提示词。

- **创建**：点击顶部工作空间切换器 → "➕ 创建工作空间" → 填写信息
- **编辑**：点击工作空间右侧 ⚙️ 按钮 → 修改信息/配置提示词/删除
- **切换**：点击顶部工作空间切换器选择其他工作空间

**系统提示词配置**：
- 📋 使用模板（代码审查、写作助手、数据分析等）
- 🤖 AI 生成
- ✏️ 自定义

### 技能系统

技能是预定义的工具集，可扩展 AI 能力。

- **本地导入**：技能页 → "➕ 上传技能" → 选择包含 `SKILL.md` 的目录
- **GitHub 导入**：技能页 → "⬇️ GitHub 导入" → 输入仓库 URL → 选择技能导入
- **删除**：点击技能旁的 🗑️ 按钮

**技能存储路径**：`~/.deepagents/desktop/skills/`

### Human-in-the-Loop (HITL)

敏感操作前会弹出批准对话框：
- **拒绝**：阻止操作
- **批准**：允许操作
- **自动批准全部**：后续所有工具自动批准

### 主题设置

点击顶部 🌓 按钮：
- **主题模式**：浅色 / 深色 / 自动
- **强调色**：蓝、紫、粉、橙、绿、青

---

## 配置文件

配置文件位置：`~/.deepagents/.env`

```bash
# AI 服务商配置（至少配置一个）
openai_api_key=sk-xxx
openai_model=gpt-4o
anthropic_api_key=sk-ant-xxx
anthropic_model=claude-sonnet-4-5-20250929
google_api_key=xxx
google_model=gemini-2-pro-preview

# 网络搜索
tavily_api_key=tvly-xxx

# 代理设置
http_proxy=http://127.0.0.1:7890
https_proxy=http://127.0.0.1:7890

# 技能市场
skillslm_url=https://skillslm.com

# 主题
theme=auto
accentColor=purple
```

修改配置文件后无需重启，自动生效。

---

## 常见问题

### Q: 启动时显示配置向导，但我已经配置过？

A: 检查 `~/.deepagents/.env` 文件是否存在且包含有效的 API Key。

### Q: AI 消息中出现 `</strong>` 等 HTML 标签？

A: 这是 `formatToolCalls` 和 `formatFilePaths` 函数在 HTML 转义后执行导致的。已通过暂时禁用这两个函数修复（`app.js` 第 709-724 行）。

### Q: 暗色主题下文字不清楚？

A: 早期版本的硬编码颜色问题，已在最新版本修复。

### Q: 如何切换 AI 模型？

A: 打开设置 → 修改对应服务商的 Model 字段（如 `gpt-4o`、`claude-sonnet-4-5-20250929`、`gemini-2-pro-preview`）

### Q: 应用支持 Windows/Linux 吗？

A: 当前仅支持 macOS，其他平台正在开发中。

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 发送消息 |
| `Shift + Enter` | 换行（不发送） |

---

## 版本历史

### v0.0.2 (2026-01-23)

- 修复流式聊天输出中 `</strong>` HTML 标签显示问题

### v0.0.2 (2026-01-21)

- 修复保存配置后工作空间切换器无法显示列表的问题
- 修正技能存储路径提示为 `~/.deepagents/desktop/skills/`
- 优化进程名称为小写 `cowork`

### v0.0.1 (2026-01-20)

- macOS Big Sur 风格 UI
- 工作空间管理系统
- 技能导入和管理
- Human-in-the-Loop 工具批准
- 主题切换和强调色选择
- 首次启动向导和配置热重载
