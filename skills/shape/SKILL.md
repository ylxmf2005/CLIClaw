---
name: shape
description: 在方向、任务承诺或关键系统前提尚不可信，用户预期可能与真实对象不符，或新证据推翻现有方向时使用。明确只讨论或查看时，无论是否已有 Task 都只留在对话，且优先于其他入口；宿主自动路由但未启动 Task 时也不落盘。除此之外，用户显式以 Shape 启动新 Task 会在任务根创建 `context.md`；已有 Task 先读取同一 Context，只按事实变化或用户决定修订，没有受影响内容时不写。方向清楚的低风险行动不自动触发 Shape。
---
# shape

## 先让领地说话，再决定形状

把 Shape 当作一次模拟退火：先提高探索温度，接触真实代码、运行现场、用户行为和约束，让事实、矛盾、可能性与代价浮出来；结论不再随合理调查实质变化时再降温收敛。用户描述和已有文档是意图与线索，不能替代真实对象。

能自行查明的事实先调查。价值、偏好、代价接受、范围和授权由用户裁决；证据推翻原方向时明确说明影响，不替用户悄悄改写承诺。调查可以看宽，执行范围不能随之静默扩大。

## 建立可信 Context

下面的入口契约按数组顺序匹配，首个成立的 case 决定动作。明确只讨论或查看无论有无 Task 都最优先；其余 case 只在前序条件不成立时判断，因此已有 Task 的普通查看不会变成修订。具体路径和内容规则仍由本节与 reference 界定。

```json shape-context-lifecycle-v1
[
  ["discussion_or_view_only", "conversation_only"],
  ["host_auto_route_without_task_start", "conversation_only"],
  ["explicit_shape_new_task", "create_context_at_task_root"],
  ["shape_for_existing_task", "read_context_and_revise_if_needed"]
]
```

`create_context_at_task_root` 表示把请求作为新 Task，立即在任务工作区根目录创建 `context.md`；`conversation_only` 不创建也不修改 Context；`read_context_and_revise_if_needed` 表示进入已有 Task 时先读取同一份 Context，再只更新受影响内容。初始 Context 忠实保存 Original Request 与已查明的 Reality Coordinates；未确认的 Goal、Scope、Non-goals 和 Acceptance Evidence 写 `unresolved`。

进入已有 Task 时，先读取同一份 `context.md` 和 Current Artifacts。事实变化可以更新 Reality Coordinates；承诺变化必须先让用户看见变化与代价，并取得用户决定后再修订；没有受影响内容时不写。目的地或责任范围已经成为另一项工作时新建 Task，不覆盖原 Task；同一目的下由新证据推动的修正继续更新当前 Task。

Context 生命周期、Current Artifacts 权限和可选产物见 [产物与权威来源](references/artifacts.md)，固定结构见 [Context Demo](references/templates/context.demo.md)。创建其他持久产物前，按该 reference 选择并读取对应 Demo。

## 收敛到下游不用猜

方向成立时，关键事实和代价已经清楚，目标、边界、不能破坏的关系与验收证据足以让下一位继续。具体实现路径仍可由执行者根据现场调整；新证据推翻关键前提时，重新 Shape 受影响的承诺和专业产物。

Shape 不停在一句建议上。只要下游仍会被迫猜需求、系统模型、公共契约、迁移或执行路线，就继续完成其中必要部分；局部且结构清楚的任务可以直接交给 Dev，不为形式制造文档套件。

## 边界

Shape 负责方向、任务承诺和为其成立所需的 Diagnosis、Requirements、Design、Contract、Migration 与 Plan。它不实现代码，不承担完整 Test，也不把自己的论证当作独立 Review；调查中的复现和验证只用于让当前判断有事实基础。
