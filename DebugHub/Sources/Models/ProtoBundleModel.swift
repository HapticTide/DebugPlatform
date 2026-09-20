//
//  ProtoBundleModel.swift
//  DebugHub
//
//  Protobuf 解码包：一份 descriptor set 加上与之配套的解码规则。
//
//  两者必须配套存放：规则里引用的消息类型名只在同一次生成的 descriptor 里成立，
//  分开管理会让「规则指向了旧 descriptor 里已改名的类型」这种错配悄悄发生——
//  解码不会报错，只会解不出字段。
//

import Fluent
import Vapor

final class ProtoBundleModel: Model, Content, @unchecked Sendable {
    static let schema = "proto_bundles"

    @ID(custom: "id", generatedBy: .user)
    var id: String?

    /// 人读的名字，通常是生成来源，如 `<仓库>@<commit>`
    @Field(key: "name")
    var name: String

    /// descriptor set 原始字节（protoc --descriptor_set_out 的产物）
    @Field(key: "descriptor_data")
    var descriptorData: Data

    /// 上传时的文件名，便于对账是哪一份
    @Field(key: "descriptor_filename")
    var descriptorFilename: String

    /// 解码规则 JSON 原文。可为空——没有规则时仍可按单一类型解最外层。
    @Field(key: "rules_json")
    var rulesJSON: String?

    @Field(key: "rules_filename")
    var rulesFilename: String?

    /// 当前生效的那一份。同一时刻至多一个为 true，由 Controller 保证。
    @Field(key: "is_active")
    var isActive: Bool

    @Field(key: "note")
    var note: String?

    @Timestamp(key: "created_at", on: .create)
    var createdAt: Date?

    @Timestamp(key: "updated_at", on: .update)
    var updatedAt: Date?

    init() {}

    init(
        id: String? = nil,
        name: String,
        descriptorData: Data,
        descriptorFilename: String,
        rulesJSON: String? = nil,
        rulesFilename: String? = nil,
        isActive: Bool = false,
        note: String? = nil
    ) {
        self.id = id
        self.name = name
        self.descriptorData = descriptorData
        self.descriptorFilename = descriptorFilename
        self.rulesJSON = rulesJSON
        self.rulesFilename = rulesFilename
        self.isActive = isActive
        self.note = note
    }
}
