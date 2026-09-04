import Foundation
import Security
import SystemConfiguration

/** Reads and atomically writes proxy dictionaries for every active network service. */
final class SystemProxyHelper {
    /** Stable preferences application identifier. */
    private static let applicationIdentifier = "com.interceptor.system-proxy"

    /** Dispatch the get or set command. */
    static func run(arguments: [String]) throws {
        guard let command = arguments.first else {
            throw HelperError.usage
        }
        switch command {
        case "get":
            guard arguments.count == 1 else {
                throw HelperError.usage
            }
            let preferences = try createPreferences(authorized: false)
            try writeJSON(try readSnapshot(preferences: preferences))
        case "set":
            guard arguments.count == 2, let encoded = arguments.last else {
                throw HelperError.usage
            }
            let requested = try decodeSnapshot(encoded)
            let preferences = try createPreferences(authorized: true)
            try applySnapshot(requested, preferences: preferences)
            try writeJSON(try readSnapshot(preferences: preferences))
        default:
            throw HelperError.usage
        }
    }

    /** Create read-only preferences or an authorization-backed mutation session. */
    private static func createPreferences(authorized: Bool) throws -> SCPreferences {
        if !authorized {
            guard let preferences = SCPreferencesCreate(
                nil,
                applicationIdentifier as CFString,
                nil
            ) else {
                throw HelperError.preferencesUnavailable
            }
            return preferences
        }

        var authorization: AuthorizationRef?
        let flags: AuthorizationFlags = [
            .interactionAllowed,
            .extendRights,
            .preAuthorize,
        ]
        let status = AuthorizationCreate(nil, nil, flags, &authorization)
        guard status == errAuthorizationSuccess, let authorization else {
            throw HelperError.authorizationFailed(status)
        }
        defer {
            AuthorizationFree(authorization, [])
        }
        guard let preferences = SCPreferencesCreateWithAuthorization(
            nil,
            applicationIdentifier as CFString,
            nil,
            authorization
        ) else {
            throw HelperError.preferencesUnavailable
        }
        return preferences
    }

    /** Read proxy dictionaries for all enabled services in the current network set. */
    private static func readSnapshot(preferences: SCPreferences) throws -> [String: Any] {
        let services = try activeServices(preferences: preferences)
        let snapshots = services.map { item in
            [
                "id": item.identifier,
                "name": item.name,
                "settings": SCNetworkProtocolGetConfiguration(item.proxyProtocol)
                    as? [String: Any] ?? [:],
            ] as [String: Any]
        }
        return ["services": snapshots]
    }

    /** Validate every requested service before changing one preferences transaction. */
    private static func applySnapshot(
        _ snapshot: [String: Any],
        preferences: SCPreferences
    ) throws {
          guard let requestedServices = snapshot["services"] as? [[String: Any]] else {
            throw HelperError.invalidSnapshot
        }
        let currentServices = try activeServices(preferences: preferences)
        let currentByIdentifier = Dictionary(
            uniqueKeysWithValues: currentServices.map { ($0.identifier, $0) }
        )
        let requestedIdentifiers = requestedServices.compactMap { $0["id"] as? String }
        guard requestedIdentifiers.count == requestedServices.count,
              Set(requestedIdentifiers).count == requestedIdentifiers.count,
              Set(requestedIdentifiers) == Set(currentByIdentifier.keys) else {
            throw HelperError.serviceSetChanged
        }

        var mutations: [(SCNetworkProtocol, [String: Any])] = []
        for requested in requestedServices {
            guard let identifier = requested["id"] as? String,
                  let settings = requested["settings"] as? [String: Any],
                  PropertyListSerialization.propertyList(settings, isValidFor: .binary),
                  let current = currentByIdentifier[identifier] else {
                throw HelperError.invalidSnapshot
            }
            mutations.append((current.proxyProtocol, settings))
        }

        for (proxyProtocol, settings) in mutations {
            guard SCNetworkProtocolSetConfiguration(
                proxyProtocol,
                settings as CFDictionary
            ), SCNetworkProtocolSetEnabled(proxyProtocol, true) else {
                _ = SCPreferencesSynchronize(preferences)
                throw HelperError.configurationRejected
            }
        }
        guard SCPreferencesCommitChanges(preferences) else {
            _ = SCPreferencesSynchronize(preferences)
            throw HelperError.commitFailed
        }
        guard SCPreferencesApplyChanges(preferences) else {
            throw HelperError.applyFailed
        }
    }

    /** Enumerate enabled, configurable services in deterministic identifier order. */
    private static func activeServices(
        preferences: SCPreferences
    ) throws -> [ActiveNetworkService] {
        guard let networkSet = SCNetworkSetCopyCurrent(preferences),
              let networkServices = SCNetworkSetCopyServices(networkSet)
                as? [SCNetworkService] else {
            throw HelperError.preferencesUnavailable
        }
        let active = networkServices.compactMap { service -> ActiveNetworkService? in
            guard SCNetworkServiceGetEnabled(service),
                  SCNetworkServiceGetInterface(service) != nil,
                  let identifier = SCNetworkServiceGetServiceID(service) as String?,
                  let proxyProtocol = SCNetworkServiceCopyProtocol(
                    service,
                    kSCNetworkProtocolTypeProxies
                  ) else {
                return nil
            }
            let name = SCNetworkServiceGetName(service) as String? ?? identifier
            return ActiveNetworkService(
                identifier: identifier,
                name: name,
                proxyProtocol: proxyProtocol
            )
        }
        return active.sorted { $0.identifier < $1.identifier }
    }

    /** Decode and validate one base64 JSON snapshot. */
    private static func decodeSnapshot(_ encoded: String) throws -> [String: Any] {
          guard let data = Data(base64Encoded: encoded),
              let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              JSONSerialization.isValidJSONObject(object) else {
            throw HelperError.invalidSnapshot
        }
        return object
    }

    /** Emit one compact JSON document to stdout. */
    private static func writeJSON(_ value: [String: Any]) throws {
        guard JSONSerialization.isValidJSONObject(value) else {
            throw HelperError.invalidSnapshot
        }
        let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data([0x0A]))
    }
}

/** SystemConfiguration handles retained for one active network service. */
private struct ActiveNetworkService {
    /** Stable SystemConfiguration service identifier. */
    let identifier: String
    /** User-visible service name. */
    let name: String
    /** Proxies protocol object owned by the shared preferences session. */
    let proxyProtocol: SCNetworkProtocol
}

/** Helper failures surfaced to Electron Main through stderr and exit status. */
private enum HelperError: Error, CustomStringConvertible {
    case usage
    case preferencesUnavailable
    case authorizationFailed(OSStatus)
    case invalidSnapshot
    case serviceSetChanged
    case configurationRejected
    case commitFailed
    case applyFailed

    /** Stable, non-sensitive diagnostic text. */
    var description: String {
        switch self {
        case .usage:
            return "usage: macos-proxy-helper get | set <base64-json>"
        case .preferencesUnavailable:
            return "SystemConfiguration preferences are unavailable"
        case let .authorizationFailed(status):
            return "authorization failed with status \(status)"
        case .invalidSnapshot:
            return "proxy snapshot is invalid"
        case .serviceSetChanged:
            return "active network services changed before commit"
        case .configurationRejected:
            return "SystemConfiguration rejected proxy settings"
        case .commitFailed:
            return "SystemConfiguration commit failed"
        case .applyFailed:
            return "SystemConfiguration apply failed"
        }
    }
}

do {
    try SystemProxyHelper.run(arguments: Array(CommandLine.arguments.dropFirst()))
} catch {
    let message = String(describing: error) + "\n"
    FileHandle.standardError.write(Data(message.utf8))
    exit(EXIT_FAILURE)
}