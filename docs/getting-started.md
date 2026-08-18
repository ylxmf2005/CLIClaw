# 安装与首次使用

## 前提

- Node.js 18 或更高版本；
- 至少安装 Codex CLI、Claude Code 或 Pi 之一；
- `longrein` 位于 `PATH`。

## 安装

```bash
npm install -g longrein
longrein install -y
```

交互运行 `longrein install` 会选择宿主、Skills 和可选 Extension。非交互安装默认面向 Codex、Claude Code 和 Pi；只安装到部分宿主时显式选择，多个宿主参数可以组合：

```bash
longrein install -y --codex
longrein install -y --claude
longrein install -y --pi
```

安装只管理三类内容：

1. 宿主 Skills 目录中的 Longrein Skills；
2. 宿主常驻指令文件中带 `LONGREIN BLOCK` 标记的 `job` 与 `soul`；
3. 用户明确选择的可选 Extension。

遇到同名但来源不同的 Skill 时，Longrein 不会静默接管。安装完成后重新打开宿主，使新 Skills 与规则进入新会话。

## 可选 Extension

Extension 包含 FastCtx、CodeGraph、cass，以及提供 `coding-agent-session-search` Skill 的 `longrein-extension` 插件：

```bash
longrein install -y --extensions
longrein install -y --extension-components codegraph cass
longrein extension install codegraph cass --yes
longrein extension install --dry-run
longrein extension install --yes
longrein extension status
```

交互式 `longrein install` 与 `longrein extension install` 都会逐项选择组件。非交互安装使用 `--extensions` 选择全部，或通过 `--extension-components` 和位置参数明确指定。Longrein 调用各项目的官方安装或升级命令，不 fork 上游工具。CodeGraph 不会自动索引仓库；用户仍需在明确选择的项目根目录运行 `codegraph init`。

## 验证

```bash
longrein status
longrein list
longrein doctor
```

`status` 默认显示全部 Longrein Skills 和两个常驻块在三个宿主中的状态。若只检查部分宿主，传入 `--codex`、`--claude` 或 `--pi`。

## 开始使用

方向、范围或关键关系还不可靠时，从 Shape 开始：

| Claude Code | Codex | Pi |
| --- | --- | --- |
| `/shape <你的请求>` | `$shape <你的请求>` | `/skill:shape <你的请求>` |

用户明确只是讨论或查看时，无论是否已有 Task 都只留在对话，这一边界优先于其他入口；宿主自动选择 Shape 但尚未启动 Task 时同样不落盘。除此之外，用户显式以 Shape 启动新 Task 会立即在任务工作区根目录创建 `context.md`；已有 Task 进入 Shape 时先读取同一份 Context，事实变化可以更新 Reality Coordinates，承诺变化只在用户决定后修订，没有受影响内容时不写。Context 保存 Original Request、Reality Coordinates、Goal、Scope、Non-goals、Acceptance Evidence 和 Current Artifacts，未确认的承诺保持 `unresolved`；其他 Skills 从其中当前有效的入口继续，方向清楚的轻量工作无需先调用 Shape。

## 更新与卸载

```bash
npm install -g longrein@latest
longrein update
longrein uninstall --all
```

`uninstall --all` 会从所选宿主移除 Longrein 管理的 Skills、`job` / `soul` 规则块、Longrein Extension 插件与 marketplace，以及仍然存在的旧 Longrein MCP 注册；不带宿主参数时还会停止并禁用旧 Dashboard、Runtime 同步服务。它不卸载独立上游的 FastCtx、CodeGraph、cass，也不删除项目中的 `context.md`、专业产物或旧任务数据。

## 从源码使用

```bash
npm install
npm run typecheck
npm test
npm run build
npm link
longrein install --link -y
```

`--link` 适合开发 checkout；发布或稳定使用采用默认复制模式。
