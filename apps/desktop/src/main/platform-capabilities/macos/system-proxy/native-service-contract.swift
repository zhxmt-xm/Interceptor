import Darwin
import Foundation
import Security

struct MacosHelperServiceConfiguration: Decodable {
    let protocolVersion: Int
    let socketPath: String
    let clientUserId: uid_t
    let clientExecutablePath: String
    let clientRequirement: String

    static func readProtectedConfiguration(path: String, ownerUserId: uid_t) throws -> (data: Data, directory: String) {
        var attributes = stat()
        guard lstat(path, &attributes) == 0,
              attributes.st_mode & S_IFMT == S_IFREG,
              attributes.st_uid == ownerUserId,
              attributes.st_mode & 0o022 == 0 else {
            throw MacosHelperServiceError.unprotectedConfiguration
        }
        let configurationPath = try canonicalPath(path)
        let configurationDirectory = (configurationPath as NSString).deletingLastPathComponent
        var directory = configurationDirectory
        repeat {
            var directoryAttributes = stat()
            guard lstat(directory, &directoryAttributes) == 0,
                  directoryAttributes.st_mode & S_IFMT == S_IFDIR,
                  directoryAttributes.st_uid == ownerUserId,
                  directoryAttributes.st_mode & 0o022 == 0 else {
                throw MacosHelperServiceError.unprotectedConfiguration
            }
            if ownerUserId != 0 || directory == "/" { break }
            directory = (directory as NSString).deletingLastPathComponent
        } while true

        return (try Data(contentsOf: URL(fileURLWithPath: configurationPath)), configurationDirectory)
    }

    static func load(path: String, ownerUserId: uid_t = geteuid()) throws -> Self {
        let protectedFile = try readProtectedConfiguration(path: path, ownerUserId: ownerUserId)
        let data = protectedFile.data
        let configurationDirectory = protectedFile.directory
        guard let object = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              Set(object.keys) == Set([
                "protocolVersion", "socketPath", "clientUserId", "clientExecutablePath", "clientRequirement"
              ]) else {
            throw MacosHelperServiceError.invalidConfiguration
        }
        let configuration = try JSONDecoder().decode(Self.self, from: data)
          let socketDirectory = try canonicalPath((configuration.socketPath as NSString).deletingLastPathComponent)
                    let clientExecutablePath = configuration.clientExecutablePath
        guard configuration.protocolVersion == 1,
              configuration.clientUserId > 0,
              configuration.socketPath.hasPrefix("/"),
              configuration.clientExecutablePath.hasPrefix("/"),
              socketDirectory == configurationDirectory,
              configuration.clientRequirement.range(
                of: "^cdhash H\"[0-9a-fA-F]{40,64}\"$", options: .regularExpression
              ) != nil else {
            throw MacosHelperServiceError.invalidConfiguration
        }
        return Self(
            protocolVersion: configuration.protocolVersion,
            socketPath: (socketDirectory as NSString).appendingPathComponent(
                (configuration.socketPath as NSString).lastPathComponent
            ),
            clientUserId: configuration.clientUserId,
            clientExecutablePath: clientExecutablePath,
            clientRequirement: configuration.clientRequirement
        )
    }

    static func canonicalPath(_ path: String) throws -> String {
        guard let resolved = realpath(path, nil) else {
            throw MacosHelperServiceError.invalidConfiguration
        }
        defer { free(resolved) }
        return String(cString: resolved)
    }
}

struct MacosHelperDevelopmentConfiguration: Decodable {
    let protocolVersion: Int
    let socketPath: String
    let clientUserId: uid_t

    static func load(path: String, ownerUserId: uid_t = geteuid()) throws -> Self {
        let protectedFile = try MacosHelperServiceConfiguration.readProtectedConfiguration(path: path, ownerUserId: ownerUserId)
        guard let object = try JSONSerialization.jsonObject(with: protectedFile.data) as? [String: Any],
              Set(object.keys) == Set(["protocolVersion", "socketPath", "clientUserId"]) else {
            throw MacosHelperServiceError.invalidConfiguration
        }
        let configuration = try JSONDecoder().decode(Self.self, from: protectedFile.data)
        let socketDirectory = try MacosHelperServiceConfiguration.canonicalPath((configuration.socketPath as NSString).deletingLastPathComponent)
        guard configuration.protocolVersion == 1, configuration.clientUserId > 0,
              configuration.socketPath.hasPrefix("/"), socketDirectory == protectedFile.directory else {
            throw MacosHelperServiceError.invalidConfiguration
        }
        return Self(protocolVersion: 1,
            socketPath: (socketDirectory as NSString).appendingPathComponent((configuration.socketPath as NSString).lastPathComponent),
            clientUserId: configuration.clientUserId)
    }
}

struct MacosHelperServiceRequest {
    let protocolVersion: Int
    let requestId: String
    let operation: String
    let proxyReplacement: MacosHelperProxyReplacement?
    let certificate: MacosHelperCertificate?

    static func decode(_ data: Data) throws -> Self {
        guard let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any],
              let versionNumber = object["protocolVersion"] as? NSNumber,
              CFGetTypeID(versionNumber) != CFBooleanGetTypeID(),
              let protocolVersion = object["protocolVersion"] as? Int,
              let requestId = object["requestId"] as? String,
              !requestId.isEmpty, requestId.utf8.count <= 128,
              let operation = object["operation"] as? String else {
            throw MacosHelperServiceError.invalidRequest
        }
        guard protocolVersion == 1 else {
            throw MacosHelperServiceError.protocolMismatch
        }
        let hasParameters = ["system-proxy.replace", "certificate.import", "certificate.remove"].contains(operation)
        let expectedKeys: Set<String> = hasParameters
            ? ["protocolVersion", "requestId", "operation", "parameters"]
            : ["protocolVersion", "requestId", "operation"]
        guard Set(object.keys) == expectedKeys else { throw MacosHelperServiceError.invalidRequest }
        return Self(
            protocolVersion: protocolVersion,
            requestId: requestId,
            operation: operation,
            proxyReplacement: operation == "system-proxy.replace"
                ? try MacosHelperProxyReplacement.decode(object["parameters"]) : nil,
            certificate: ["certificate.import", "certificate.remove"].contains(operation)
                ? try MacosHelperCertificate.decode(object["parameters"]) : nil
        )
    }
}

struct MacosHelperProxyReplacement {
    let expectedSnapshot: [String: Any]
    let replacementSnapshot: [String: Any]

    static func decode(_ value: Any?) throws -> Self {
        guard let parameters = value as? [String: Any],
              Set(parameters.keys) == Set(["expectedSnapshot", "replacementSnapshot"]) else {
            throw MacosHelperServiceError.invalidRequest
        }
        return Self(
            expectedSnapshot: try decodeSnapshot(parameters["expectedSnapshot"]),
            replacementSnapshot: try decodeSnapshot(parameters["replacementSnapshot"])
        )
    }

    private static func decodeSnapshot(_ value: Any?) throws -> [String: Any] {
        guard let snapshot = value as? [String: Any], Set(snapshot.keys) == Set(["services"]),
              let services = snapshot["services"] as? [[String: Any]] else {
            throw MacosHelperServiceError.invalidRequest
        }
        var identifiers = Set<String>()
        for service in services {
            guard Set(service.keys) == Set(["id", "name", "settings"]),
                  let identifier = service["id"] as? String, !identifier.isEmpty,
                  identifiers.insert(identifier).inserted,
                  service["name"] is String,
                  let settings = service["settings"] as? [String: Any],
                  PropertyListSerialization.propertyList(settings, isValidFor: .binary) else {
                throw MacosHelperServiceError.invalidRequest
            }
        }
        return ["services": services.sorted { ($0["id"] as! String) < ($1["id"] as! String) }]
    }
}

enum MacosHelperServiceError: String, Error, CustomStringConvertible {
    case unprotectedConfiguration = "service configuration must be protected"
    case invalidConfiguration = "invalid service configuration"
    case transportUnavailable = "service transport unavailable"
    case unauthorizedClient = "unauthorized-client"
    case invalidRequest = "invalid-request"
    case protocolMismatch = "protocol-mismatch"
    case unsupportedOperation = "unsupported-operation"
    case authorizationRequired = "authorization-required"
    case snapshotConflict = "snapshot-conflict"
    case operationFailed = "operation-failed"
    case verificationFailed = "verification-failed"

    var description: String { rawValue }
}