# Longrein 文档

README 负责产品入口；这里记录安装与 CLI；每个 Skill 的行为由自己的 `SKILL.md` 与 `references/` 定义。

| 你的问题 | 文档 |
| --- | --- |
| 如何安装、验证、更新或卸载 | [安装与首次使用](getting-started.md) |
| 有哪些命令和目标选项 | [CLI](cli.md) |
| 如何为 Codex 配置可选的本地检索工具 | [Codex 推荐 Extension](codex-recommended-extension.md) |
| 设计这些 Skills 时参考了哪些研究与实践 | [研究资料](../references/README.md) |

## 权威来源

| 信息 | 唯一来源 |
| --- | --- |
| 产品定位与公开入口 | [`README.md`](../README.md) |
| CLI 真实行为 | `cli/src/` 与相应测试 |
| Agent 行为 | `skills/<name>/SKILL.md` |
| 当前任务承诺与产物入口 | 任务的 `context.md` |
| 专业结论 | `context.md` 中列出的对应产物 |
| 常驻规则 | `global/job.md` 与 `global/soul.md` |
| 研究资料的导航与适用范围 | [`references/README.md`](../references/README.md) |

发生冲突时回到拥有该信息的来源，并修订引用它的文档。
