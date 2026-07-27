# Context、产物与权威来源

Shape 让任务承诺在 `context.md` 中成立，并把下游需要独立引用的专业判断放进最窄产物。文件组合由真实消费者决定，不用文档数量表演完整。

## Context 生命周期

任务工作区根目录优先使用用户为当前 Task 指定的目录；没有指定时，使用宿主提供的当前 workspace root，宿主没有 workspace 概念时使用当前工作目录。嵌套代码仓库不会自动成为新的任务根；位置仍有歧义或不可写时，先把冲突交给用户，不静默分散 Context。

四种入口与动作的映射只由 [Shape Skill](../SKILL.md) 中的 `shape-context-lifecycle-v1` 合同定义；这里不复述 case 判定，只展开动作的文件语义。

- `create_context_at_task_root`：为新 Task 按 [Context Demo](templates/context.demo.md) 创建根目录 `context.md`，忠实记录 Original Request 和已查明的 Reality Coordinates；尚未取得用户决定的 Goal、Scope、Non-goals 与 Acceptance Evidence 保持 `unresolved`。
- `conversation_only`：不创建也不修改 Context；以后启动 Task 时重新按合同判断，先前对话不会自动变成任务授权。
- `read_context_and_revise_if_needed`：进入已有 Task 时先读取同一份 Context；事实变化可以更新 Reality Coordinates，承诺变化先取得用户决定，没有受影响内容时不写。实现结果、专业产物和对话摘要都不能反向创造授权。

同一目的下的新证据继续修订当前 Task；目的地或责任范围已经独立时，建立新 Task 和新的根 `context.md`，不覆盖原任务。

## 选择产物

- 根因需要独立交接时创建 `shape/diagnosis.md`。
- 需求或系统模型需要被下游独立引用时创建 `shape/requirements.md`、`shape/design.md`；执行路线需要持久交接时创建任务根目录 `plan.md`。
- 公共或跨模块契约需要独立评审和持续修订时创建 `shape/contract.md`，Design 只链接它。
- 迁移、混合版本、不可逆点和退出路线需要独立判断时创建 `shape/migration.md`，Plan 只安排执行。
- 结论依赖可重放调查、复现或运行输出时，把材料放入 `shape/evidence/`，正文说明它证明什么和不能证明什么。

诊断终点不为形式创建 Requirements、Design 或 Plan；局部且结构清楚的任务也可以直接交给 Dev。不要创建汇总型 `shape/shape.md`：方向与专业结论回到各自当前来源。

## Current Artifacts

Current Artifacts 是当前入口，不是历史清单。产物拥有者在它可供下游依赖时加入路径，并在修订后决定是否重新加入。任何 Agent 取得直接反证时，都可以把受影响的路径移出入口并说明证据，但不能借此改写产物内容；只有产物拥有者能修订未委托内容并重新确认路径，产物明确委托的字段由被委托者维护。文件本身不必删除。

维护入口不等于取得任务授权。Original Request 保持原始输入；Shape 依据事实更新 Reality Coordinates，并只在用户决定后修订 Goal、Scope、Non-goals 或 Acceptance Evidence。其他产物生产者可以维护自己负责的路径，有直接反证时可以让受影响路径失效，但不能借此改变任务承诺。

## 唯一来源

`context.md` 拥有 Original Request、Reality Coordinates、当前任务承诺、Acceptance Evidence 和当前产物入口；Requirements 拥有详细可观察需求；Contract 拥有需要独立修订的公共关系；Design 拥有对任务承诺的当前系统回答；Migration 拥有过渡与退出关系；Plan 拥有当前路线。其他文件引用这些来源，不复制正文。

模板是固定结构的唯一来源。创建产物前读取对应 Demo；保留它的承重信息与来源关系，让对象决定可选章节和具体表达：

- [Context Demo](templates/context.demo.md)
- [Requirements Demo](templates/requirements.demo.md)
- [Design Demo](templates/design.demo.md)
- [Plan Demo](templates/plan.demo.md)
- [Diagnosis Demo](templates/diagnosis.demo.md)
- [Contract Demo](templates/contract.demo.md)
- [Migration Demo](templates/migration.demo.md)

模板中的可选章节可以省略。经调查确认不适用时记录依据；没有调查的部分保持未知，不用 `none` 把未知伪装成不存在。
