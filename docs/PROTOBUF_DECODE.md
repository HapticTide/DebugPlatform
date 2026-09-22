# Protobuf 解码

把抓到的 protobuf 报文解成带字段名的结构，而不是 `field_3: 1735...`。

## 两种模式

| 模式 | 需要什么 | 能看到什么 |
|---|---|---|
| Wire Format | 什么都不用 | 字段编号 + 值。类型靠猜，嵌套要手点。 |
| Schema | 一个解码包 | 字段名、枚举名，并自动展开嵌套的 `bytes` 字段。 |

HTTP 详情页和 DB Inspector 都支持这两种。上传过解码包后默认走 Schema，可随时切回。

## 解码包

一个解码包 = **descriptor set** + **解码规则**（可选）。在「Proto」页上传，存在 Hub，
所有人、所有浏览器共用同一份。同一时刻只有一份生效，可以随时切换或回滚到旧版本。

### descriptor set

```bash
protoc --descriptor_set_out=schema.desc --include_imports -I=<proto 根> <文件...>
```

`--include_imports` 不能省，否则跨文件引用的类型会缺失。

### 解码规则

descriptor 只说某个字段是 `bytes`，不说里面装的是什么。真正的类型往往由**同一条消息里的
另一个字段**决定——路由 path、类型枚举等等——而那层映射不在 descriptor 里。解码规则补的就是它。

```jsonc
{
  "version": 1,
  // path → 各方向的消息类型
  "pathTypes": {
    "/some/endpoint": { "req": "pkg.ReqBody", "rsp": "pkg.RspBody", "deliver": "pkg.DeliverBody" }
  },
  // 开关字段的取值 → 类型
  "switchTables": {
    "envelopeType": { "1": "pkg.EnvelopeA", "2": "pkg.EnvelopeB" }
  },
  // 哪个消息的哪个 bytes 字段，按什么规则展开
  "nested": [
    {
      "parent": "pkg.Envelope",
      "field": "body",
      "rules": [{ "byPath": { "field": "path", "as": "deliver" } }]
    },
    {
      "parent": "pkg.DeliverBody",
      "field": "payload",
      "rules": [
        { "decodeAs": "pkg.Opaque", "when": { "field": "encrypted", "equals": true } },
        { "switchField": "envelopeType", "when": { "field": "encrypted", "equals": false } }
      ]
    }
  ]
}
```

一条 `rules` 按书写顺序匹配，取第一个 `when` 成立的。三种选型方式：

- `decodeAs` — 固定类型
- `switchField` — 按同级字段的取值查 `switchTables`
- `byPath` — 按同级的 path 字段查 `pathTypes`

`oneof` 字段不需要写规则，解码器会自动展开。

### `when` 条件按 schema 默认值判定

proto3 的标量默认值**不上线 wire**：`e2eeFlag = false` 编码时整个字段被省略，报文里
根本没有这个字节。所以 `when` 的取值判定是「字段在场就用在场的值，不在场就用 descriptor
声明的默认值」——否则 `when encrypted=false` 这类条件**永远不成立**，本该解开的明文段
会被一路报成「不满足解码条件（需 encrypted=false）」。

例外是有 explicit presence 的字段：真 `oneof` 成员、proto3 `optional` 合成的 oneof。
它们的「不在场」是可观测语义（未设置），不补默认值——补了就等于把 unset 当成了 `false`，
拿着规则去硬解一段可能是密文的字节。

> 这个坑在自造夹具上照不出来。protobufjs 自己编码时会把显式赋的 `false` 写上线
> （它按 `hasOwnProperty` 决定写不写），而 SwiftProtobuf / Java protobuf 按 proto3 语义
> 省略。只有真实 wire 才触发，所以 `protoDecodeEngine.test.ts` 里的回归用例必须自己
> 构造「默认值不上线」的字节。

这份 JSON 一般由 proto 仓在生成 descriptor 时一并产出，不要手写维护——两处各写一份必然漂移。

## 解不开的东西会如实标出来

加密载荷、没有规则的字段、规则条件不成立的分支，都会显示成
`⟨未解码 148 字节 · 不满足解码条件（需 encrypted=false）⟩`，并保留字节数。

这是刻意的：protobuf 的 wire format 让「解错」不报错——用错误的类型去解一段字节，
往往能"成功"解出一组张冠李戴的字段，没有异常也没有报错，只有看起来很合理的错数据。
所以宁可留着原始字节，也不给一个像那么回事的错结果。

展开区底部的「展开了 N 段嵌套」可以看到每一层解成了什么、哪一层为什么没解开。

## 另外两件事

**外层 base64**：有的端会把 protobuf body 再 base64 编码一次才放进 HTTP body。
解码前会自动识别并剥掉这一层，界面上会标「已剥离外层 base64」。

**路径匹配**：`pathTypes` 按 URL 的 path 精确匹配，query 和 host 会被忽略。
没命中时不会去猜，而是让你手动选类型。

**复制 JSON**：Schema 模式右上角的「复制 JSON」把这一次解码打包成一份可以直接贴给
服务端的证据：

```jsonc
{
  "url": "...", "direction": "deliver",
  "messageType": "pkg.RspBody",        // 按哪个类型解的——决定字段名是否可信
  "descriptor": "improto_desc_xxx",    // descriptor 版本
  "rules": "im-proto@xxxxxxx",         // 规则表版本
  "sizeBytes": 1852,
  "decoded": { /* 解出来的树；未展开的段是结构化对象，带 hexPreview */ },
  "undecoded": [ { "path": "items[0].body", "reason": "..." } ],
  "raw": { "base64": "..." }           // 原始字节，对方可自行重解
}
```

带版本与原始字节是刻意的：少了版本，两边按不同 proto 解出的字段名不可比；少了原始
字节，对方只能信这边的截图，没法自己重解一遍——争的就从字节变成了截图。
