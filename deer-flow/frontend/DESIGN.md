# MetaInsight 前端设计规范（DESIGN）

> 本文件是整个 `deer-flow/frontend` 的统一设计规范，所有页面与组件必须遵循。
> 当前视觉基线参考 [leedlime.com](https://leedlime.com) 的设计语言 1:1 提炼：
> **温暖奶油底色 + 衬线大标题 + 深墨文字 + 柔和阴影 + 克制语义色**。
>
> 目标气质：优雅、精致、专业、有编辑感（editorial），而非通用 SaaS 模板感。

---

## 1. 设计原则

1. **温暖而非冷白**：底色用暖奶油白，不用纯白或冷灰，营造纸感与高级感。
2. **衬线做标题，无衬线做正文**：大标题用衬线字体传递编辑感与信任感；正文/UI 用无衬线保证可读性。
3. **高对比深墨文字**：主文字用近黑深墨色，通过透明度阶梯表达层级，而非堆砌多种颜色。
4. **克制用色**：品牌色只用于关键行动点与状态，语义色（蓝/绿/琥珀）仅用于数据与状态指示。
5. **柔和阴影 + 细边框**：卡片用极淡的弥散阴影 + 1px 细边框，不用生硬投影或厚重描边。
6. **充足留白**：区块之间用大号垂直留白，内容居中于限宽容器，拒绝拥挤。

---

## 2. 色彩系统（Color）

### 2.1 基础色板

| Token | 值 | 用途 |
| --- | --- | --- |
| `--color-cream` | `#F9F8F6` | 页面主底色（暖奶油白） |
| `--color-cream-dark` | `#F3F1ED` | 次级底色 / 交替区块 |
| `--color-ink` | `#161412` | 主文字 / 深色区块底 / 主按钮底（深墨近黑） |
| `--color-ink-soft` | `#2D2D2D` | 次级深色 |
| `--color-paper` | `#FFFFFF` | 卡片 / 浮层底（纯白） |
| `--color-line` | `#E8E5E0` | 细边框 / 分隔线（暖灰） |
| `--color-line-dark` | `#26241F` | 深色区块内的分隔线 |

### 2.2 文字层级（用透明度阶梯，不用新颜色）

| 层级 | 值 | 用途 |
| --- | --- | --- |
| 主文字 | `ink / 100%` | 标题、正文强调 |
| 次级 | `rgba(22,20,18,0.9)` | 副标题 |
| 正文 | `rgba(22,20,18,0.7)` | 正文、描述 |
| 弱化 | `rgba(22,20,18,0.6)` | 辅助说明 |
| 占位 | `rgba(22,20,18,0.5)` | placeholder、次要标签 |
| 禁用 | `rgba(22,20,18,0.4)` | 禁用态 |

> 在深色区块上，文字用 `cream` 及 `rgba(249,248,246, 0.5~0.9)` 阶梯。

### 2.3 语义色（仅用于状态 / 数据指示）

| Token | 值 | 用途 |
| --- | --- | --- |
| `--color-info` | `#1D4ED8` | 信息 / 链接强调（蓝） |
| `--color-success` | `#3F6218` | 成功 / 上涨 / 正向（深绿） |
| `--color-warning` | `#B45309` | 警告 / 关注（琥珀） |
| `--color-danger` | `#B91C1C` | 错误 / 下跌 / 风险（红） |

> 涨跌色按市场规则映射到 success/danger（A 股红涨绿跌、美股绿涨红跌），与现有 `--color-mi-red/green` 对齐。

### 2.4 深色区块

- 背景：`#0A0A0A`（纯黑）或 `#161412`（深墨）。
- 用于：页脚前 CTA、对比强调区、AI/技术亮点区。
- 深色区块内文字、边框、阴影全部反转为浅色系阶梯。

---

## 3. 字体系统（Typography）

### 3.1 字体族

| 角色 | 字体 | 说明 |
| --- | --- | --- |
| 展示标题（Display） | `"Newsreader", Georgia, "Times New Roman", serif` | H1/H2 大标题，衬线，编辑感 |
| 正文 / UI（Sans） | `"Inter", -apple-system, system-ui, "Segoe UI", Roboto, sans-serif` | 正文、按钮、导航、表格 |
| 等宽（Mono） | `ui-monospace, "SF Mono", Menlo, monospace` | 数据、代码、百分比、标签 |

> 现有项目已内置 Manrope/Sora，可在过渡期内作为 Sans 回退；新增页面统一向 Inter/Newsreader 迁移。

### 3.2 字阶（Type Scale）

| 层级 | 字号 / 行高 | 字重 | 字距 | 字体 |
| --- | --- | --- | --- | --- |
| Display / H1 | `clamp(2.75rem, 6vw, 4.5rem)` / `1.0` | 400 | `-0.02em`（约 -1.44px @72px） | Newsreader |
| H2 | `clamp(2rem, 4vw, 3rem)` / `1.1` | 400 | `-0.02em` | Newsreader |
| H3 | `1.25rem` / `1.4` | 500 | `-0.01em` | Inter |
| 正文 Lead | `1.125rem ~ 1.25rem` / `1.6` | 400 | `0` | Inter |
| 正文 Body | `1rem` / `1.6` | 400 | `0` | Inter |
| 小字 Small | `0.875rem` / `1.5` | 400/500 | `0` | Inter |
| 标签 Caption | `0.75rem` / `1.4` | 500 | `+0.02em` | Inter |
| Eyebrow 眉题 | `0.6875rem` / `1` | 600 | `+0.22em` 大写 | Inter |

> 关键规则：**衬线大标题用 400 字重 + 负字距**，靠字号与留白制造气场，不要加粗。

---

## 4. 间距与布局（Spacing & Layout）

- **容器**：内容最大宽度 `1200px`（`max-w-6xl`），水平居中，左右 gutter `24px`（移动端）→ `32px`（桌面）。
- **区块垂直留白**：`py-20`（80px）~ `py-32`（128px）；重要首屏可达 `min-h-[90vh]`。
- **卡片内边距**：`p-6`（24px）~ `p-8`（32px）。
- **网格**：特性区用 `md:grid-cols-3`，步骤区用 `md:grid-cols-3`，数据条用 `md:grid-cols-4`，间距 `gap-6 ~ gap-8`。
- **分节**：相邻区块用 `1px` 细分隔线（`border-line`）或底色交替（cream / cream-dark / paper）区分。

---

## 5. 圆角与边框（Radius & Border）

| 元素 | 圆角 |
| --- | --- |
| 按钮 / 输入框 / 小标签 | `8px`（`rounded-lg`） |
| 卡片 / 浮层 | `12px ~ 16px`（`rounded-xl ~ rounded-2xl`） |
| 大型容器 / CTA 横幅 | `20px ~ 24px`（`rounded-3xl`） |
| 头像 / 状态点 | 全圆（`rounded-full`） |

- 边框统一 `1px solid var(--color-line)`；深色区块内用 `1px solid var(--color-line-dark)`。
- **不使用**新粗野主义的 2-3px 黑边 + 硬投影。

---

## 6. 阴影（Shadow / Elevation）

采用**低透明度、大弥散、小偏移**的柔和阴影，营造纸张浮起感：

| 层级 | 值 |
| --- | --- |
| `shadow-card`（默认卡片） | `0 1px 2px rgba(22,20,18,0.04), 0 4px 16px rgba(22,20,18,0.06)` |
| `shadow-card-hover`（悬浮） | `0 2px 4px rgba(22,20,18,0.05), 0 12px 32px rgba(22,20,18,0.10)` |
| `shadow-pop`（弹层/下拉） | `0 8px 30px rgba(22,20,18,0.12)` |
| `shadow-cta`（主按钮） | `0 1px 2px rgba(22,20,18,0.10)`（近乎无阴影，靠底色对比） |

> 悬浮时卡片可轻微上移 `-translate-y-0.5 ~ -translate-y-1` 并加深阴影。

---

## 7. 组件规范（Components）

### 7.1 按钮（Button）

| 变体 | 背景 | 文字 | 边框 | 圆角 | 说明 |
| --- | --- | --- | --- | --- | --- |
| Primary | `ink` | `cream` | 无 | `8px` | 主行动点（进入工作台 / 开始） |
| Secondary | `paper` | `ink` | `1px line` | `8px` | 次行动点 |
| Ghost | 透明 | `ink/70` → `ink` | 无 | `8px` | 导航链接 / 弱操作 |
| On-Dark Primary | `cream` | `ink` | 无 | `8px` | 深色区块内主按钮 |
| On-Dark Ghost | 透明 | `cream/80` | `1px line-dark` | `8px` | 深色区块内次按钮 |

- 尺寸：`sm`（h-9, px-4, text-sm）、`md`（h-11, px-6, text-[15px]）、`lg`（h-12, px-7, text-[15px]）。
- 悬浮：Primary 加深到 `#000` 或微上移；Secondary 背景变 `cream-dark`。
- 字重 500，字距 0。

### 7.2 卡片（Card）

- 背景 `paper`，边框 `1px line`，圆角 `rounded-2xl`，阴影 `shadow-card`。
- 悬浮：`shadow-card-hover` + `-translate-y-1`，过渡 `300ms`。
- 图标容器：`size-11 rounded-xl`，用 `ink` 实底 + `cream` 图标，或 `cream-dark` 底 + `ink` 图标。

### 7.3 导航（Header）

- 高度 `h-16`，sticky 顶部，滚动后底色 `cream/90` + `backdrop-blur` + 底部 `1px line`。
- 左 Logo，中/右导航链接（Ghost 样式），右侧 Primary 小按钮。
- 导航链接：`text-sm font-medium ink/70 hover:ink`。

### 7.4 标签 / 徽章（Badge）

- 状态徽章：`rounded-full px-2.5 py-0.5 text-xs font-medium`，语义色浅底 + 深字（如 success 浅绿底 + 深绿字）。
- Eyebrow 眉题：`text-[11px] font-semibold tracking-[0.22em] uppercase ink/50`。

### 7.5 数据 / 表格

- 数字用等宽或 500 字重无衬线；表头 `text-xs uppercase tracking-wider ink/50`。
- 行分隔 `1px line`；状态用徽章。

---

## 8. 动效（Motion）

- **入场**：`fade + rise`（上移 12px + 淡入），`600~900ms`，缓动 `cubic-bezier(0.22, 1, 0.36, 1)`，按元素 stagger `80~120ms`。
- **悬浮**：`150~300ms ease`，位移/阴影/颜色变化。
- **滚动**：区块进入视口时触发入场（Intersection Observer），只触发一次。
- **跑马灯**（信任徽章条）：水平无限滚动，`translateX` 线性循环。
- 避免过度动画；数据加载用骨架屏或 spinner。

---

## 9. 图标与图像（Iconography & Imagery）

- 图标：线性几何图标（Lucide），单色 `ink` 或语义色，尺寸 `size-4 ~ size-5`。
- 产品图：浅色模式的真实界面截图 / 数据卡片，配柔和阴影。
- 装饰：可用极淡的网格 / 渐变光斑做背景纹理（透明度 ≤ 0.15），不喧宾夺主。

---

## 10. 落地页结构基线（Landing Structure）

按以下顺序组织（内容用 MetaInsight 投研文案）：

1. **Header**：Logo + 导航 + 主 CTA。
2. **Hero**：左文案（衬线 H1 + 副标题 + CTA + 信任点）+ 右产品卡片（市场脉搏卡）。
3. **数据条（Highlights）**：4 列关键指标。
4. **能力区（Capabilities）**：3 列特性卡片。
5. **工作流（Workflow）**：3 步流程。
6. **深色 CTA**：深墨横幅 + 主按钮。
7. **Footer**：多列链接 + 版权。

---

## 11. 实施约定（Implementation）

- 设计 token 统一定义在 `src/styles/globals.css` 的 `@theme` 块中，命名 `--color-*` / `--font-*` / `--shadow-*`。
- 落地页组件位于 `src/components/landing/`，优先使用本规范 token。
- **不破坏**现有工作台的 `--color-mi-*`（蓝色系）token；落地页新风格通过新增 token 实现，二者并存、按页面作用域使用。
- 新组件先对齐本规范，再逐步把旧 `mi-*` 蓝色营销页迁移过来。

> 版本：v1.0 · 2026-08-28 · 基线参考 leedlime.com
