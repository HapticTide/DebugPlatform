# HTTP 列表与详情交互优化方案（基于现有结构）

本文档基于当前 WebUI 结构（`VirtualHTTPEventTable` / `GroupedHTTPEventList` / `HTTPEventDetail`）提出可落地的交互与组件拆分建议，尽量复用现有逻辑并降低改动风险。

## 目标与原则

- 目标：提升列表可读性、重定向链路可见性、诊断效率与可扩展性。
- 原则：不打破现有数据流；优先小步可落地；保留现有组件命名与渲染模式。

## 交互草图（文本）

```
┌───────────────────────────────────────────────────────────────┐
│ Filters: [Status] [Method] [Domain] [Has Redirect] [Search]  │
├───────────────────────────────────────────────────────────────┤
│ LIST (左侧)                                   │ DETAIL (右侧) │
│ 12:01 GET /api/im/media/shortLink   302  18ms │ Summary        │
│  ↳ redirect 1/2 • → next                        │ Final: 200    │
│ 12:01 GET /uat/innov/media/...bin     200  92ms │ Chain: 1/2     │
│                                                   │            │
│ [选中行高亮]                                      │ Key facts    │
│                                                   │ - URL        │
│                                                   │ - Status     │
│                                                   │ - Size       │
│                                                   │ - TLS/Proto  │
│                                                   │              │
│                                                   │ Tabs:        │
│                                                   │ [Headers]    │
│                                                   │ [Body]       │
│                                                   │ [Diff]       │
│                                                   │ [Timing]     │
└───────────────────────────────────────────────────────────────┘
```

## 列表交互建议

- 主信息固定：`METHOD + PATH + STATUS + DURATION`，host 以弱化样式显示。
- 重定向链路：行内显示 `redirect 1/2`，可点击进入“链路视图”（仅显示该链路事件）。
- 上一跳/下一跳：保留跳转图标，点击后自动滚动定位并高亮目标行。
- 悬浮信息：完整 URL、状态码分类（2xx/3xx/4xx/5xx）、耗时等级（慢请求高亮）。

## 详情交互建议

- Summary 区（置顶）：`Final Status / Chain len / Final URL / Total time / Size`。
- Tabs：`Headers` / `Body` / `Diff` / `Timing`。
- Diff：默认对比“上一跳 vs 当前”（或“当前 vs 下一跳”），仅显示差异字段。

## 组件拆分建议（基于现有结构）

### 1) 列表侧

- `HTTPEventList`（容器）
  - 维护 filter 状态、选中行、滚动定位、list data。
  - 根据当前模式渲染 `VirtualHTTPEventTable` 或 `GroupedHTTPEventList`。

- `HTTPEventRow`（行渲染）
  - Props: `event`, `isSelected`, `redirectIndex`, `redirectTotal`, `onJumpPrev`, `onJumpNext`
  - 只做展示，不包含滚动与选择逻辑。

- `HTTPEventTags`（状态徽标 + redirect）
  - 展示 `statusBadge`、`redirectBadge`、`slowBadge`。
  - 触发 `onJumpPrev/onJumpNext`。

- `HTTPEventFilters`
  - Props: `status`, `method`, `domain`, `hasRedirect`, `search`
  - 统一管理并下发筛选状态。

### 2) 详情侧

- `HTTPEventDetail`（容器）
  - Props: `event`, `chain`, `selectedTab`
  - 负责 Summary 区和 tabs 切换。

- `HTTPEventSummary`
  - Props: `event`, `chainMeta`
  - 展示 Final Status / Chain len / URL / Size / Time。

- `HTTPEventTabs`
  - 内部渲染：
    - `HTTPHeadersView`
    - `HTTPBodyView`
    - `HTTPDiffView`
    - `HTTPTimingView`

- `HTTPDiffView`
  - Props: `current`, `compareTo`（上一跳或下一跳）
  - 展示差异字段列表（header/path/status/body size）。

## 数据与计算建议

- `useRedirectChain(events)`
  - 返回 `redirectIndexMap`, `redirectNextMap`, `chainMap`（每个 eventId -> chain 信息）。

- `useEventSelection()`
  - 管理 `selectedId`, `scrollToId`, `highlightId`（自动滚动与定位）。

## 最小落地路径

1. 抽出 `HTTPEventRow` 与 `HTTPEventTags`（列表复用）。
2. 新增 `HTTPEventSummary` + `HTTPEventTabs`，`HTTPEventDetail` 只做组合。
3. 引入 `useRedirectChain` 替代分散 map。
4. `HTTPDiffView` 先做 headers diff，body diff 后续迭代。

## 风险与注意事项

- 事件量大时，详情应支持按需加载或显示 loading/retry。
- 链路视图与普通列表模式切换时，要保持选中行一致性。
- 过滤条件多时建议支持“保存筛选”或快速重置。

