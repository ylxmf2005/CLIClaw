<div align="center">

# Longrein

**让强模型放手工作，让人保留方向、边界与裁决。**

面向 Codex、Claude Code 和 Pi 的工程 Skills 与安装 CLI。

[快速开始](#快速开始) · [七个-skills](#七个-skills) · [安装选择](#安装选择) · [文档](#文档)

</div>

```text
longrein install
├── 7 个工程 Skills
├── job + soul
└── Codex · Claude Code · Pi
```

## 快速开始

需要 Node.js 18 或更高版本：

```bash
npm install -g longrein
longrein install -y
longrein status
```

`longrein install -y` 会把全部 Skills 与 `job`、`soul` 常驻规则安装到 Codex 和 Claude Code，并跳过可选 Extension。安装完成后重新打开宿主，让新能力进入会话。

方向、范围或关键关系还不可靠时，可以直接开始：

| Claude Code | Codex | Pi |
| --- | --- | --- |
| `/shape <你的请求>` | `$shape <你的请求>` | `/skill:shape <你的请求>` |

宿主也可以根据每个 Skill 的 `description` 自动选择能力。

## 七个 Skills

Longrein 不规定固定阶段。Agent 根据当前真正缺少的能力选择 Skill，并从真实对象与可检查证据继续工作。

| Skill | 负责什么 |
| --- | --- |
| [`shape`](skills/shape/SKILL.md) | 方向、边界或关键前提还不足以承诺时，接触现实并形成可信 Context |
| [`grill`](skills/grill/SKILL.md) | 方向已经成形时，分轮推进决策前沿，直到用户取得共同理解 |
| [`dev`](skills/dev/SKILL.md) | 从已确认的承诺进入代码，把行为改到根因需要的尺度 |
| [`test`](skills/test/SKILL.md) | 从真实入口走到真实结果端，以可重放证据判断承诺是否成立 |
| [`review`](skills/review/SKILL.md) | 对需求、设计、代码或交付物做独立裁决 |
| [`walkthrough`](skills/walkthrough/SKILL.md) | 沿承重关系讲清非平凡对象，让用户能够继续判断 |
| [`evolution`](skills/evolution/SKILL.md) | 从真实轨迹提炼值得改变未来工作的经验 |

`job` 负责长期协作、权威来源与交接纪律；`soul` 保存面向现实、克制复杂度并尊重用户决定的工程人格。

## Context 与产物

用户明确只想讨论或查看时，无论是否已有 Task 都只在对话中处理，这一边界优先于其他入口；宿主自动选择 Shape 但尚未启动 Task 时同样不落盘。除此之外，用户显式以 Shape 启动新 Task 会在任务工作区根目录创建 `context.md`；已有 Task 进入 Shape 时先读取同一份 Context，事实变化可以更新 Reality Coordinates，承诺变化只在用户决定后修订，没有受影响内容时不写。

`context.md` 保存 Original Request、Reality Coordinates、Goal、Scope、Non-goals、Acceptance Evidence 和 Current Artifacts。未确认的承诺保持 `unresolved`，专业结论留在拥有它的产物中；Current Artifacts 只列当前有效入口。方向清楚的轻量工作无需先调用 Shape，也不为形式创建任务文件。

## 安装选择

交互安装可以选择宿主、Skills 和 Extension 组件：

```bash
longrein install
```

脚本或自动化环境可以明确选择：

```bash
longrein install shape dev test -y --codex
longrein install -y --claude
longrein install -y --pi
```

默认使用复制模式；开发 checkout 可以使用 `--link`。遇到同名但不属于 Longrein 的 Skill 时，安装不会静默覆盖。

### 可选 Extension

Extension 编排 FastCtx、CodeGraph、cass，以及提供 `coding-agent-session-search` 的 `longrein-extension` 插件：

```bash
longrein install -y --extensions
longrein extension install codegraph cass --yes
longrein extension status
```

Longrein 调用这些项目的官方安装渠道，不维护上游 fork，也不会自动为仓库运行 `codegraph init`。各组件与宿主的具体支持情况见 [Codex 推荐 Extension](docs/codex-recommended-extension.md)。

## 维护与卸载

```bash
longrein update
longrein doctor
longrein uninstall shape dev
longrein uninstall --all
```

不带 `--all` 时只移除指定 Skills。`uninstall --all` 清理 Longrein 拥有的 Skills、规则块、插件、marketplace、旧 MCP 注册与旧服务；它保留独立安装的 FastCtx、CodeGraph、cass，也保留项目中的 `context.md`、专业产物和旧任务数据。

完整命令与宿主选项见 [CLI 文档](docs/cli.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [文档入口](docs/README.md) | 文档导航与权威来源 |
| [安装与首次使用](docs/getting-started.md) | 安装、验证、更新与卸载 |
| [CLI](docs/cli.md) | 命令、宿主与目标选择 |
| [Codex 推荐 Extension](docs/codex-recommended-extension.md) | 可选的本地检索、代码关系与历史能力 |

## 从源码开发

```bash
git clone https://github.com/ylxmf2005/Longrein.git
cd Longrein
npm install
npm run typecheck
npm test
npm link
longrein install --link -y
```

问题与建议请提交到 [GitHub Issues](https://github.com/ylxmf2005/Longrein/issues)。

## License

MIT
