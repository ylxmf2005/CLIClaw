# 设计系统与状态

在需要提取或扩展共享主题、复用组件、深浅模式、复杂交互状态时读取本文件。局部修改已经能完整复用项目现有系统时，不为形式引入新的 token 层级。

## 先提取，再补足

从真实 theme、CSS variables、Tailwind 配置、组件源码、设计稿和已渲染页面中提取：

- 品牌色、语义色、中性色、surface、border、ring 和阴影；
- 字体文件与 fallback、实际字重、字号、行高和控件文字；
- 页面 gutter、section 节奏、panel padding、控件高度和行密度；
- radius、elevation、z-index、断点、container query 与 motion duration；
- 组件已有 variant、状态、组合方式和不一致处。

保存准确值、来源命名和实际用途。多个来源冲突时先确认当前运行代码与目标表面真正消费哪一个，不静默把冲突平均成新系统。

## 使用最小三层模型

项目已有分层时沿用它。没有分层且当前变化确实需要共享系统时，按下列责任组织：

| 层级 | 保存什么 | 何时改变 |
| --- | --- | --- |
| Primitive | 原始色阶、尺寸、字体、间距、radius、duration | 基础尺度确实改变时 |
| Semantic | background、foreground、surface、muted、border、accent、status、focus 等用途 | 主题或产品语义改变时 |
| Component | 某组件的 variant、size、shape 和局部状态值 | 组件存在真实特殊需要时 |

组件优先消费 semantic token，不直接绑定 raw color；深浅模式优先覆盖 semantic，不复制整套组件规则。小型界面只需要 semantic token 时就停在那里，不为了完整性补齐全部 primitive 与 component token。

## 固定组件契约

只为重复、可组合、存在 variant 或承载状态的界面建立组件。每个组件至少说清：

- 用途和不适用场景；
- anatomy 与可选 slot；
- variant、size 与命名；
- 可达状态及状态之间的优先级；
- 键盘行为、accessible name、focus、错误与反馈；
- 窄容器、移动端和长内容下怎样变化。

当多个交互状态同时成立时，默认按 `disabled > loading > active > focus > hover > default` 解决视觉冲突；业务 error、success 或 selected 状态应在组件契约中说明怎样与这条优先级组合。loading 必须阻止重复动作，disabled 仍需可辨认，focus 不能被 hover 或 active 吞掉。

状态变化通常使用 150–300ms 的颜色、边框、阴影或轻量 transform 过渡；组件进出可以更慢，但不能推迟操作完成。所有 motion token 都需要 reduced-motion 的替代表达。

## 保持响应式与主题关系

从内容和工作流决定 breakpoint，不把设备名称当成固定真理。页面级布局使用项目现有 grid/flex 约定，组件在容器决定行为时优先 container query。主题切换、响应式和 component variant 应分别承担自己的变化，不把三者塞进不可解释的一次性 class 组合。

完成时检查：组件中没有可以由现有 semantic token 表达的硬编码值；同一状态在相关组件间可辨认且一致；主题切换只改变应改变的语义；长文案、空数据、错误和窄容器没有迫使调用者绕开组件。
