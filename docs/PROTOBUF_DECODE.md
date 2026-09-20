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
