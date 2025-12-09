//
//  DomainPolicyController.swift
//  DebugHub
//
//  Created by Sun on 2025/12/04.
//

import Fluent
import Vapor

struct DomainPolicyController: RouteCollection {
    func boot(routes: RoutesBuilder) throws {
        let policies = routes.grouped("api", "domain-policies")
        policies.get(use: listPolicies)
        policies.post(use: createOrUpdatePolicy)
        policies.delete(":policyId", use: deletePolicy)

        // Device specific overrides (optional per requirement, but good to have)
        let devicePolicies = routes.grouped("api", "devices", ":deviceId", "domain-policies")
        devicePolicies.get(use: listDevicePolicies)
    }

    // MARK: - List Policies (Global or All)

    func listPolicies(req: Request) async throws -> [DomainPolicyModel] {
        try await DomainPolicyModel.query(on: req.db)
            .all()
    }

    // MARK: - List Device Policies

    func listDevicePolicies(req: Request) async throws -> [DomainPolicyModel] {
        guard let deviceId = req.parameters.get("deviceId") else {
            throw Abort(.badRequest, reason: "Missing deviceId")
        }

        // Return both global (deviceId is nil) and device specific
        return try await DomainPolicyModel.query(on: req.db)
            .group(.or) { group in
                group.filter(\.$deviceId == nil)
                group.filter(\.$deviceId == deviceId)
            }
            .all()
    }

    // MARK: - Create or Update Policy

    func createOrUpdatePolicy(req: Request) async throws -> DomainPolicyModel {
        let dto = try req.content.decode(DomainPolicyDTO.self)

        // Check if exists
        let existing = try await DomainPolicyModel.query(on: req.db)
            .filter(\.$domain == dto.domain)
            .filter(\.$deviceId == dto.deviceId)
            .first()

        if let policy = existing {
            policy.status = dto.status
            policy.note = dto.note
            try await policy.save(on: req.db)
            return policy
        } else {
            let policy = DomainPolicyModel(
                deviceId: dto.deviceId,
                domain: dto.domain,
                status: dto.status,
                note: dto.note
            )
            try await policy.save(on: req.db)
            return policy
        }
    }

    // MARK: - Delete Policy

    func deletePolicy(req: Request) async throws -> HTTPStatus {
        guard let policyId = req.parameters.get("policyId") else {
            throw Abort(.badRequest)
        }

        guard let policy = try await DomainPolicyModel.find(policyId, on: req.db) else {
            throw Abort(.notFound)
        }

        try await policy.delete(on: req.db)
        return .ok
    }
}

struct DomainPolicyDTO: Content {
    let deviceId: String?
    let domain: String
    let status: DomainPolicyStatus
    let note: String?
}
