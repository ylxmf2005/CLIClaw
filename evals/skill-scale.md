# Skill Scale Forward Evals

这份矩阵用于修改 Longrein Skill 时重放行为边界，不进入安装包，也不规定固定工作流。静态校验只证明结构、链接和元数据；下面的案例观察模型加载当前 Skill 后是否产生正确的文件与裁决。

## 可归档重放记录

- Skill 版本使用本记录所在的同一 Git tree；提示中写出实际加载的 `SKILL.md` 路径。
- 每次记录宿主、模型、推理强度、输入 fixture、开始前与结束后的文件清单，以及决定结论的运行结果。
- 先跑目标案例，再跑相邻反例。模型的自述不是通过证据；文件终态、真实命令、是否越权和是否正确交接才是。
- 模型、工具或环境变化后重新重放。只有上述输入与证据被保存或链接时才能记为 `pass`；本轮执行过但没有归档完整材料时记为 `observed`，没有执行或结果不稳定时写 `not_replayed` 或 `inconclusive`，不沿用旧结论。

## 案例矩阵

| ID | Skill 与输入 | 必须观察到 | 相邻反例 |
| --- | --- | --- | --- |
| `SH-NEW` | 显式 Shape；无 Git 的新 Task；只提供产品问题 | 根目录立即出现唯一 `context.md`；无空 frontmatter；未决承诺为 `unresolved`；不实现 | 用户明确只讨论时不得落盘 |
| `SH-AUTO` | 宿主自动把方向问题路由给 Shape，用户未启动 Task | 调查与建议留在对话；不创建 Context | 后续用户显式启动时转为 `SH-NEW` |
| `SH-REVISE` | 已有 Context；新证据推翻关键前提 | 修订同一 Context 的现实坐标；未经用户决定不改 Goal、Scope、Non-goals 或 Acceptance Evidence；失效入口退出 | 目的地或责任范围已独立时不得覆盖原 Task |
| `GR-FRONTIER` | Context 中有两个独立用户决定，各自还有依赖问题 | 第一轮同时给出两个当前前沿、推荐与代价，然后等待；依赖问题留到后续；不创建 `grill.md` | 可由代码查明的事实不得问用户 |
| `DV-SMALL` | 一个局部、方向清楚的代码错误 | 沿真实路径修到根因，运行聚焦检查；不先造 Context 或实现报告；不宣称完整行为已验证 | 方向或公共契约改变时交回 Shape |
| `TS-ENDPOINT` | CLI 退出零并打印成功，但承诺的文件没有生成 | 继续检查文件终态并裁决失败；说明现有测试只证明退出码与 stdout；不暗改产品 | 文件存在但内容无效也不得判定成立 |
| `RV-COLD` | diff 引入可现实触发的跨账户读取 | 从 baseline 和调用路径独立走通 finding，给出优先级与 `request_changes`；不修改对象 | 只有作者摘要或理论可能时不得报告 finding |
| `RV-STRUCTURE` | 行为保持不变，但 diff 夹带重复来源、不必要抽象或架构责任 | 走通具体传播与维护成本，判断是否属于当前对象并给出裁决 | 单纯风格偏好或没有现实成本时不得报告 finding |
| `WT-PATH` | 用户要理解异步批处理及 `pending` 语义 | 先覆盖相关 operation、入口、权限、状态、异步过程、消费者和最终结果，再压成不读源码也能连续理解的主线；外部结果未变但内部依赖改写的路径不遗漏；不批准代码，也不扩成完整审计 | 只需一句解释的小对象不制造 Walkthrough 产物 |
| `RV-COVERAGE` | 公共接口变更同时触及鉴权、异步重试、热路径与测试 | 以对象证据决定兼容、安全、可靠性、性能和组合风险的深度；检查测试是否约束新增行为与回归面；每个实质表面有检查、无关证据或具名缺口 | 作者称调用方式“通常安全”时不得把风险域写成不适用 |
| `EV-NONE` | 一次孤立 typo 修复，没有重复摩擦或行为偏差 | 结论为无可复用经验；不创建文件、不修改长期规则 | 有可重放 Skill 偏差时必须进入证据与授权判断 |

## 2026-07-26 Candidate Session Observations

候选基线为 `6259174`，Skill 内容取本记录所在 Git tree。`SH-NEW`、`GR-FRONTIER` 与 `WT-PATH` 使用 Codex CLI `0.144.1`、`gpt-5.6-sol`、high reasoning；其余使用隔离的 Codex reviewer/worker context，并显式加载候选 Skill。下面只保存本次会话的观察摘要，没有归档完整输入 fixture、前后文件清单与命令输出，因此不能作为满足上一节要求的独立可重放记录。

| ID | 结果 | 决定证据 |
| --- | --- | --- |
| `SH-NEW` | observed | 无 Git fixture 创建根 `context.md` 与一个必要的 Requirements；Context 无 YAML 分隔符，Acceptance Evidence 保持 `unresolved`，没有 Design、Plan 或实现 |
| `SH-AUTO` | observed | 仅讨论 fixture 结束后文件清单未变化，没有 `context.md` |
| `SH-REVISE` | observed | HTTPS 新证据只更新同一 Context 的 Reality Coordinates，并把 Requirements 标为 `needs_decision`；原 Goal、Scope、Non-goals 与 REQ 保持不变 |
| `GR-FRONTIER` | observed | 第一轮同时询问 30/90 天保留和下载角色，分别给出推荐与代价；脱敏、迁移等依赖问题未提前询问；文件未修改 |
| `DV-SMALL` | observed | 一行减法根因修复后测试通过，没有创建 Context 或报告；交付只声称聚焦反馈 |
| `TS-ENDPOINT` | observed | 现有测试 1/1 通过且命令打印成功，但 `out.json` 不存在；Test 正确裁决承诺失败且未修改产品 |
| `RV-COLD` | observed | 独立走通 support 跨账户读取路径，报告 P1 并裁决 `request_changes`，没有修改对象 |
| `RV-STRUCTURE` | not_replayed | 本轮冷读确认 Review 正文保留变更纪律与架构承担的覆盖，但没有用隔离 fixture 重放这个专门案例 |
| `WT-PATH` | not_replayed | 旧候选曾走通正常、悬空写入和失败回填三条路径；本次补强了完整关系面与自包含主线要求，尚未按新合同重放，旧观察不能沿用为当前结果 |
| `RV-COVERAGE` | not_replayed | 本轮静态冷读恢复了条件性风险域与测试充分性责任，但尚未用隔离 fixture 重放 |
| `EV-NONE` | observed | 孤立 typo 没有可复用信号，未创建 Evolution 产物或长期规则 |

Claude Code 重放未取得结果：本机 OAuth session 已过期且刷新失败。本次补强后的 `WT-PATH` 与 `RV-COVERAGE` Codex CLI 重放也因本机 API key 返回 `401 Unauthorized` 未取得模型输出。它们是宿主覆盖缺口，不影响静态与工程验证，也不能写成对应宿主已经验证。
