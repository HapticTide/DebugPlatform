//
//  ProtoBundleController.swift
//  DebugHub
//
//  Protobuf 解码包的托管：上传一次，所有人、所有浏览器共用同一份。
//

import Fluent
import Vapor

struct ProtoBundleController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        // 注册方已在 "api" 分组下，这里不再重复前缀
        let bundles = routes.grouped("proto-bundles")
        bundles.get(use: listBundles)
        // 必须显式放开 body 上限：Vapor 默认只收 16KB，而 descriptor set 光 base64 就几十 KB
        // 起步，大一些的 proto 仓能到几 MB。用默认值上传会直接 413。
        bundles.on(.POST, body: .collect(maxSize: "32mb"), use: uploadBundle)
        // 放在 ":bundleId" 之前：否则 "active" 会被当成一个 id 去查
        bundles.get("active", use: getActiveBundle)
        bundles.get(":bundleId", use: getBundle)
        bundles.put(":bundleId", "activate", use: activateBundle)
        bundles.delete(":bundleId", use: deleteBundle)
    }

    // MARK: - List

    /// 列表只给元信息。descriptor 是几十 KB 的二进制，列表页不需要它。
    func listBundles(req: Request) async throws -> [ProtoBundleSummaryDTO] {
        let bundles = try await ProtoBundleModel.query(on: req.db)
            .sort(\.$createdAt, .descending)
            .all()

        return bundles.map(ProtoBundleSummaryDTO.init(model:))
    }

    // MARK: - Fetch

    func getActiveBundle(req: Request) async throws -> ProtoBundleDetailDTO {
        guard let bundle = try await ProtoBundleModel.query(on: req.db)
            .filter(\.$isActive == true)
            .first()
        else {
            throw Abort(.notFound, reason: "No active proto bundle")
        }

        return ProtoBundleDetailDTO(model: bundle)
    }

    func getBundle(req: Request) async throws -> ProtoBundleDetailDTO {
        guard let bundleId = req.parameters.get("bundleId") else {
            throw Abort(.badRequest, reason: "Missing bundleId")
        }

        guard let bundle = try await ProtoBundleModel.find(bundleId, on: req.db) else {
            throw Abort(.notFound)
        }

        return ProtoBundleDetailDTO(model: bundle)
    }

    // MARK: - Upload

    func uploadBundle(req: Request) async throws -> ProtoBundleDetailDTO {
        let dto = try req.content.decode(ProtoBundleUploadDTO.self)

        guard let descriptorData = Data(base64Encoded: dto.descriptorBase64) else {
            throw Abort(.badRequest, reason: "descriptorBase64 is not valid base64")
        }
        guard !descriptorData.isEmpty else {
            throw Abort(.badRequest, reason: "descriptor is empty")
        }

        // 规则的合法性在这里就查，而不是等前端解码时才发现——一份存不进去的规则
        // 比没有规则更糟：界面会显示「已配置」，解码却一个字段都展不开。
        if let rulesJSON = dto.rulesJSON, !rulesJSON.isEmpty {
            guard let data = rulesJSON.data(using: .utf8),
                  let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
            else {
                throw Abort(.badRequest, reason: "rulesJSON is not a JSON object")
            }
            guard object["pathTypes"] != nil || object["nested"] != nil else {
                throw Abort(.badRequest, reason: "rulesJSON has neither pathTypes nor nested")
            }
        }

        let bundle = ProtoBundleModel(
            id: UUID().uuidString,
            name: dto.name,
            descriptorData: descriptorData,
            descriptorFilename: dto.descriptorFilename,
            rulesJSON: dto.rulesJSON,
            rulesFilename: dto.rulesFilename,
            isActive: false,
            note: dto.note
        )

        try await bundle.save(on: req.db)

        // 第一份自动生效，省掉「上传完还要再点一次激活」这一步
        let total = try await ProtoBundleModel.query(on: req.db).count()
        if dto.activate == true || total == 1 {
            try await activate(bundle: bundle, on: req.db)
        }

        return ProtoBundleDetailDTO(model: bundle)
    }

    // MARK: - Activate

    func activateBundle(req: Request) async throws -> ProtoBundleSummaryDTO {
        guard let bundleId = req.parameters.get("bundleId") else {
            throw Abort(.badRequest, reason: "Missing bundleId")
        }

        guard let bundle = try await ProtoBundleModel.find(bundleId, on: req.db) else {
            throw Abort(.notFound)
        }

        try await activate(bundle: bundle, on: req.db)
        return ProtoBundleSummaryDTO(model: bundle)
    }

    /// 「至多一个生效」这个约束靠这里保证：先全部置否，再把目标置真。
    private func activate(bundle: ProtoBundleModel, on database: Database) async throws {
        try await ProtoBundleModel.query(on: database)
            .filter(\.$isActive == true)
            .set(\.$isActive, to: false)
            .update()

        bundle.isActive = true
        try await bundle.save(on: database)
    }

    // MARK: - Delete

    func deleteBundle(req: Request) async throws -> HTTPStatus {
        guard let bundleId = req.parameters.get("bundleId") else {
            throw Abort(.badRequest, reason: "Missing bundleId")
        }

        guard let bundle = try await ProtoBundleModel.find(bundleId, on: req.db) else {
            throw Abort(.notFound)
        }

        let wasActive = bundle.isActive
        try await bundle.delete(on: req.db)

        // 删掉的正好是生效中的那份时，顺位把最新的一份顶上，避免解码功能静默失效
        if wasActive,
           let next = try await ProtoBundleModel.query(on: req.db)
               .sort(\.$createdAt, .descending)
               .first() {
            try await activate(bundle: next, on: req.db)
        }

        return .ok
    }
}

// MARK: - DTOs

struct ProtoBundleUploadDTO: Content {
    let name: String
    let descriptorFilename: String
    /// base64 编码的 descriptor set
    let descriptorBase64: String
    let rulesFilename: String?
    let rulesJSON: String?
    let note: String?
    /// 是否上传后立即生效
    let activate: Bool?
}

struct ProtoBundleSummaryDTO: Content {
    let id: String
    let name: String
    let descriptorFilename: String
    let descriptorSize: Int
    let rulesFilename: String?
    let hasRules: Bool
    let isActive: Bool
    let note: String?
    let createdAt: Date?

    init(model: ProtoBundleModel) {
        id = model.id ?? ""
        name = model.name
        descriptorFilename = model.descriptorFilename
        descriptorSize = model.descriptorData.count
        rulesFilename = model.rulesFilename
        hasRules = !(model.rulesJSON?.isEmpty ?? true)
        isActive = model.isActive
        note = model.note
        createdAt = model.createdAt
    }
}

struct ProtoBundleDetailDTO: Content {
    let id: String
    let name: String
    let descriptorFilename: String
    let descriptorBase64: String
    let rulesFilename: String?
    let rulesJSON: String?
    let isActive: Bool
    let note: String?
    let createdAt: Date?

    init(model: ProtoBundleModel) {
        id = model.id ?? ""
        name = model.name
        descriptorFilename = model.descriptorFilename
        descriptorBase64 = model.descriptorData.base64EncodedString()
        rulesFilename = model.rulesFilename
        rulesJSON = model.rulesJSON
        isActive = model.isActive
        note = model.note
        createdAt = model.createdAt
    }
}
