# Codex 推荐 Extension

本文记录一套可选的 Codex 本地工程配置，用于减少无效检索、控制工具输出，并让大型代码库的结构探索更直接。它不是 Longrein 的运行前提，也不应覆盖用户已有的模型供应商、认证、插件、项目授权和个性化设置。

Longrein 自身的安装与 Skills 使用见 [安装与首次使用](getting-started.md)。本文只讨论可选的 Codex 本地效率配置。

本文组合三类能力：

| 层次 | 推荐配置 | 作用 |
| --- | --- | --- |
| Agent 编排 | `config.toml` 与只读 `explorer` | 限制并发和递归派生，把大规模检索隔离到低成本子代理 |
| 文件与终端 | FastCtx | 提供结构化读写、搜索、Bash 和增量后台任务，限制单次输出 |
| 代码结构 | CodeGraph | 为已选择的仓库建立本地符号图，查询源码、调用链和影响面 |
| 历史记忆 | `coding-agent-session-search` 与 `cass` | 检索 Codex、Claude Code、Cursor 等工具留下的本地历史会话 |

验证环境：Codex CLI `0.144.3`、FastCtx `0.1.1`、CodeGraph `1.5.0`、cass `0.6.22`，验证日期为 2026-07-22。版本变化后应先检查命令帮助和 `codex doctor`，不要把本文中的版本敏感字段视为永久契约。

## 安装原则

- 修改前备份 `~/.codex/config.toml`、`~/.codex/AGENTS.md` 和 `~/.codex/agents/`。
- 保留已有的模型供应商、认证、插件、项目授权、通知和桌面设置，只增改本文明确列出的配置。
- CodeGraph 只为用户明确选择的仓库建立索引，不自动索引主目录、下载目录或所有 Git 仓库。
- FastCtx 管理自己的 MCP 配置和 `AGENTS.md` 标记块；CodeGraph 安装器管理自己的 MCP 配置和标记块。不要复制出第二份长期规则。
- 第三方项目公布的 Token 节省比例只代表其测试样本，实际收益需要通过本机任务对照验证。

## 推荐执行顺序

顺序有实际意义：先完成通用配置和 CodeGraph，最后执行 FastCtx `apply`。部分 Codex 配置命令会重新序列化整个 TOML；如果它们在 FastCtx 之后运行，可能把 FastCtx 管理的整数写成浮点形式，导致 `fastctx status` 报配置漂移。

Longrein CLI 已把三项上游安装与 `coding-agent-session-search` Skill 收敛成可选 Extension。普通交互安装会询问是否安装；非交互安装必须显式选择：

```bash
longrein install -y --extensions
longrein install -y --extension-components codegraph cass
longrein extension install codegraph cass --yes
longrein extension install --dry-run
```

交互式安装会逐项选择组件；自动化可以用 `--extension-components` 或 `extension install [components...]` 固定选择，组件名为 `fastctx`、`codegraph`、`cass` 和 `cass-skill`。

Longrein 不 fork FastCtx、CodeGraph 或 cass：安装和升级仍调用三个项目当前公布的官方命令。以下分节保留各工具的行为、边界和人工恢复入口。

### 1. 备份现有配置

使用带时间戳的独立目录保存备份，不覆盖旧备份：

```bash
backup_dir="$HOME/.codex/backups/recommended-extension-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
cp "$HOME/.codex/config.toml" "$backup_dir/config.toml"
cp "$HOME/.codex/AGENTS.md" "$backup_dir/AGENTS.md"
if [ -d "$HOME/.codex/agents" ]; then
  cp -R "$HOME/.codex/agents" "$backup_dir/agents"
fi
```

### 2. 配置 Codex 并发与探索代理

在现有 `~/.codex/config.toml` 中合并以下配置，不重建整个文件：

```toml
[agents]
# 一个主线程加最多三个并行子线程。
max_threads = 4
# 只允许主线程派生直接子线程。
max_depth = 1
```

这些字段控制容量，不负责决定何时派发子代理。派发边界仍应由 `AGENTS.md` 或具体 Skill 定义：只有相互独立、并行确有收益的工作才派发，简单任务继续由主代理完成。

在 `~/.codex/agents/explorer.toml` 配置只读探索代理：

```toml
name = "explorer"
description = "只读探索代理：用于代码库定位、资料检索、日志与测试证据收集，并向主代理返回高密度事实报告。"
model = "gpt-5.6-terra"
model_reasoning_effort = "low"
sandbox_mode = "read-only"
developer_instructions = """
你是只读探索代理。围绕主代理给出的明确问题查清事实，并交付可直接用于决策的高密度证据报告。

- 不修改文件，不执行会改变仓库、配置、服务或外部系统状态的操作。
- 不替主代理决定方案，不把事实调查扩展成未授权的实现或重构建议。
- 不派生其他代理，不管理整体工作流。
- 优先使用最窄检索范围，记录关键文件、行号、命令结果或文档来源。
- 返回结论、证据、未知项和风险，省略无价值的原始输出与过程叙述。
"""
```

如果当前账户没有 `gpt-5.6-terra`，选择可用的快速、低成本模型，但保持 `read-only` 和低推理强度的职责边界。

### 3. 安装 CodeGraph

CodeGraph 是第三方本地代码图工具。`longrein extension install` 在已有安装上调用官方 `codegraph upgrade`，首次安装调用上游安装器，随后让官方 `codegraph install` 配置所选宿主。人工执行等价入口为：

```bash
curl -fsSL https://raw.githubusercontent.com/colbymchenry/codegraph/main/install.sh | sh
codegraph telemetry off
codegraph install --target=codex,claude --location=global --yes
```

`codegraph install` 会完成两件事：

1. 在 `config.toml` 中注册 `codegraph serve --mcp`。
2. 在全局 `AGENTS.md` 中维护 `CODEGRAPH_START` 与 `CODEGRAPH_END` 之间的短说明。

主代理会同时收到 MCP `initialize` 提供的完整使用说明；`AGENTS.md` 中的短块主要让子代理和没有 MCP 初始化能力的宿主知道，在已索引仓库中应优先使用 CodeGraph。

安装 CodeGraph 不会索引任何仓库。用户选择仓库后，在其根目录执行一次：

```bash
cd /absolute/path/to/repository
codegraph init
codegraph status
```

索引保存在仓库的 `.codegraph/` 中。不要在 `$HOME`、文件系统根目录或范围不明的父目录运行 `codegraph init`。CodeGraph `1.5.0` 已默认在 `init` 时建立索引，旧文章中的 `codegraph init -i` 已废弃。

### 4. 安装 FastCtx

FastCtx 是第三方 MCP，提供 `read`、`grep`、`glob`、`replace`、前后台 Bash 和持久任务输出。标准档位会管理 Codex 的单次工具输出保留上限，并把 FastCtx 自身的单次预算控制在更低范围。`tool_output_token_limit` 属于 FastCtx 档位的配套设置，不作为独立的通用 Codex 推荐项手写。

```bash
npm install --global fastctx --registry=https://registry.npmjs.org/
fastctx apply --tier standard --yes
fastctx status
```

`fastctx apply` 应放在其他 `config.toml` 写入动作之后。它会维护 FastCtx 自己的 MCP 表、输出预算和 `AGENTS.md` 中 `fastctx:begin` 与 `fastctx:end` 之间的说明。以后如果其他配置工具重写了 TOML，重新运行以下命令修复 FastCtx 管理项：

```bash
fastctx apply --tier standard --yes
fastctx status
```

FastCtx 与 CodeGraph 的职责不同：CodeGraph 先回答符号、调用链和影响面；FastCtx 负责配置、文档、日志、未索引内容、精确文件操作和测试命令。CodeGraph 不可用或仓库未索引时，继续使用 FastCtx。

### 5. 安装历史会话检索

历史会话检索由两部分组成：

- `coding-agent-session-search` Skill 规定 Agent 何时检索旧会话、如何限制输出，以及怎样引用证据。
- 上游 `cass` CLI 负责发现、归一化、索引和搜索 Codex、Claude Code、Cursor、Gemini、Aider、ChatGPT 等本地会话记录。

安装上游工具时优先使用 Homebrew：

```bash
brew install dicklesworthstone/tap/cass
cass --version
```

也可以使用上游校验安装器，但自动化环境应先检查脚本或固定版本：

```bash
curl -fsSL "https://raw.githubusercontent.com/Dicklesworthstone/coding_agent_session_search/main/install.sh" \
  | bash -s -- --easy-mode --verify
```

我们自己的 Skill 由 Longrein 仓库中的 `longrein-extension` 插件维护，并通过宿主插件系统安装到 Codex、Claude Code 和 Pi：

```bash
longrein extension install cass-skill --yes
```

首次使用或状态未知时，不要直接运行会打开交互式 TUI 的裸 `cass`。Agent 始终从只读预检开始：

```bash
cass triage --json
```

当输出包含 `next_command` 时，先检查其影响，再按原样执行。常见的索引刷新命令是：

```bash
cass index --json --no-progress-events
```

搜索结果必须保持有界，并使用机器可读格式：

```bash
cass search "authentication redirect timeout" \
  --robot --robot-meta --limit 10 --fields summary --max-tokens 4000
```

`cass` 默认可以使用本地词法索引。语义模型需要用户明确同意后单独下载；缺少语义模型时，词法回退仍是有效结果，不应阻塞历史检索。

四类能力的边界如下：CodeGraph 回答当前仓库的代码结构，FastCtx 接触当前文件和运行现场，`cass` 找回过去会话中的决定与证据，`explorer` 则把大规模只读调查隔离到独立上下文。历史会话只能作为调查入口，最终结论仍应回到当前代码、配置和运行证据核验。

## 验证

配置完成后完全退出并重新打开 Codex，再执行：

```bash
codex mcp list
codex doctor
fastctx status
codegraph --version
cass --version
cass triage --json
```

预期结果：

- `config.toml` 能正常解析。
- `fastctx` 和 `codegraph` 均为 enabled。
- FastCtx MCP 握手成功，工具契约检查通过，`AGENTS.md` 标记块无漂移。
- CodeGraph MCP 暴露 `codegraph_explore`。
- 已执行 `codegraph init` 的仓库中，`codegraph status` 显示有效索引；未初始化仓库保持未索引状态。
- 所选宿主已安装 Longrein Extension，并能发现其中的 `coding-agent-session-search` Skill。
- `cass triage --json` 能报告索引健康度、搜索可用性和必要的下一条命令。

验证实际收益时，使用同一仓库的同类任务比较工具调用次数、输入 Token、完成时间和结论完整性。不要只根据工具自己的 benchmark 判断是否保留。

## 回滚

FastCtx 通过自己的管理命令撤销配置：

```bash
fastctx unapply --yes
npm uninstall --global fastctx
```

CodeGraph 项目索引按仓库删除，随后再移除代理配置与 CLI：

```bash
cd /absolute/path/to/repository
codegraph uninit

codegraph uninstall --target=codex --location=global --yes
```

历史会话检索的 Skill 与 CLI 分开卸载。插件通过宿主插件管理器移除：

```bash
codex plugin remove longrein-extension@longrein --json
claude plugin uninstall longrein-extension@longrein --scope user
brew uninstall cass
```

卸载 CLI 不自动删除本地会话源文件。`cass` 生成的索引和可选语义模型也不应作为普通卸载步骤静默清理；确需释放空间时，先用 `cass status --json` 确认数据目录和资产性质，再由用户明确决定。

需要恢复安装前的完整 Codex 配置时，从对应时间戳备份中逐项恢复。不要用一个旧 `config.toml` 直接覆盖后来新增的认证、插件、项目授权或其他有效配置。

## 暂不纳入

- Headroom 的代理、共享记忆和自动学习影响面较宽，与 FastCtx 输出控制存在重叠，只有真实长日志或大 JSON 仍持续污染上下文时再隔离试验。
- RTK 主要压缩 Codex Bash Hook 路径，而 FastCtx 通过 MCP 执行 Bash，默认链路不能稳定覆盖，暂不增加第二套 Shell 代理。
- Caveman 主要压缩模型回复，并会增加常驻提示成本；需要短回复时使用任务级长度要求，不改变全局沟通质量。
