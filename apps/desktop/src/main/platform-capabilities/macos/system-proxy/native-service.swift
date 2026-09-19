import Darwin
import Foundation
import Security
import os

private enum MacosHelperClientAuthentication {
    case production(MacosHelperServiceConfiguration, SecRequirement)
    case development(MacosHelperDevelopmentConfiguration)

    var socketPath: String {
        switch self {
        case .production(let configuration, _): return configuration.socketPath
        case .development(let configuration): return configuration.socketPath
        }
    }

    var clientUserId: uid_t {
        switch self {
        case .production(let configuration, _): return configuration.clientUserId
        case .development(let configuration): return configuration.clientUserId
        }
    }
}

private enum MacosHelperAuthenticatedClient {
    case production(SecCode, SecStaticCode, [String: Any])
    case development
}

/** Serves an approved local client without inheriting authority from its request payload. */
final class MacosHelperService {
    private let logger = Logger(subsystem: "com.zhxmt.interceptor.platform-capabilities", category: "authentication")
    /** Configuration must be owned by the service account and not writable by other users. */
    private let authentication: MacosHelperClientAuthentication
    /** One local listener retained until orderly service shutdown. */
    private var listener: Int32 = -1
    /** Dispatch sources retain the socket and orderly shutdown callbacks. */
    private var listenerSource: DispatchSourceRead?
    private var shutdownSources: [DispatchSourceSignal] = []

    /** Load protected configuration without installing anything or changing system state. */
    init(configurationPath: String) throws {
        let configuration = try MacosHelperServiceConfiguration.load(path: configurationPath)
        var requirement: SecRequirement?
        guard SecRequirementCreateWithString(
            configuration.clientRequirement as CFString, [], &requirement
        ) == errSecSuccess, let requirement else {
            throw MacosHelperServiceError.invalidConfiguration
        }
        authentication = .production(configuration, requirement)
    }

    init(developmentConfigurationPath: String) throws {
        authentication = .development(try MacosHelperDevelopmentConfiguration.load(path: developmentConfigurationPath))
    }

    static func run(configurationPath: String) throws {
        var services: [MacosHelperService] = []
        var attributes = stat()
        if lstat(configurationPath, &attributes) == 0 {
            services.append(try MacosHelperService(configurationPath: configurationPath))
        } else if errno != ENOENT { throw MacosHelperServiceError.invalidConfiguration }
        let developmentPath = (configurationPath as NSString).deletingLastPathComponent + "/development.json"
        if lstat(developmentPath, &attributes) == 0 {
            services.append(try MacosHelperService(developmentConfigurationPath: developmentPath))
        } else if errno != ENOENT { throw MacosHelperServiceError.invalidConfiguration }
        guard !services.isEmpty else { throw MacosHelperServiceError.invalidConfiguration }
        try run(services: services)
    }

    /** Bind the private endpoint and accept requests until SIGTERM or SIGINT. */
    func run() throws {
        try Self.run(services: [self])
    }

    private static func run(services: [MacosHelperService]) throws {
        signal(SIGPIPE, SIG_IGN)
        do {
            for service in services { try service.start() }
        } catch {
            for service in services { service.stop() }
            throw error
        }
        for signalNumber in [SIGTERM, SIGINT] {
            signal(signalNumber, SIG_IGN)
            let shutdown = DispatchSource.makeSignalSource(signal: signalNumber, queue: .main)
            shutdown.setEventHandler {
                for service in services { service.stop() }
                exit(EXIT_SUCCESS)
            }
            services[0].shutdownSources.append(shutdown)
            shutdown.resume()
        }
        let ready = try JSONSerialization.data(withJSONObject: ["event": "ready", "protocolVersion": 1])
        FileHandle.standardOutput.write(ready + Data([0x0A]))
        dispatchMain()
    }

    private func start() throws {
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        let pathBytes = Array(authentication.socketPath.utf8CString)
        guard pathBytes.count <= MemoryLayout.size(ofValue: address.sun_path) else {
            throw MacosHelperServiceError.invalidConfiguration
        }
        withUnsafeMutableBytes(of: &address.sun_path) { destination in
            destination.copyBytes(from: pathBytes.map { UInt8(bitPattern: $0) })
        }
        try removeStaleEndpoint(address: &address)
        listener = socket(AF_UNIX, SOCK_STREAM, 0)
        guard listener >= 0 else { throw MacosHelperServiceError.transportUnavailable }
        let bound = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.bind(listener, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard bound == 0 else {
            close(listener)
            listener = -1
            throw MacosHelperServiceError.transportUnavailable
        }
        guard chmod(authentication.socketPath, 0o600) == 0,
              (geteuid() != 0 || chown(authentication.socketPath, authentication.clientUserId, gid_t.max) == 0),
              listen(listener, 8) == 0,
              fcntl(listener, F_SETFL, O_NONBLOCK) == 0 else {
            stop()
            throw MacosHelperServiceError.transportUnavailable
        }
        let source = DispatchSource.makeReadSource(fileDescriptor: listener, queue: .main)
        source.setEventHandler { [self] in acceptConnections() }
        listenerSource = source
        source.resume()
    }

    private func removeStaleEndpoint(address: inout sockaddr_un) throws {
        var original = stat()
        guard lstat(authentication.socketPath, &original) == 0 else {
            if errno == ENOENT { return }
            throw MacosHelperServiceError.transportUnavailable
        }
        guard original.st_mode & S_IFMT == S_IFSOCK,
              original.st_uid == authentication.clientUserId || original.st_uid == geteuid() else {
            throw MacosHelperServiceError.transportUnavailable
        }
        let probe = socket(AF_UNIX, SOCK_STREAM, 0)
        guard probe >= 0 else { throw MacosHelperServiceError.transportUnavailable }
        defer { close(probe) }
        guard fcntl(probe, F_SETFL, O_NONBLOCK) == 0 else {
            throw MacosHelperServiceError.transportUnavailable
        }
        let result = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(probe, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        guard result < 0, errno == ECONNREFUSED else {
            throw MacosHelperServiceError.transportUnavailable
        }
        var current = stat()
        guard lstat(authentication.socketPath, &current) == 0,
              current.st_mode & S_IFMT == S_IFSOCK,
              current.st_dev == original.st_dev, current.st_ino == original.st_ino,
              current.st_uid == original.st_uid,
              unlink(authentication.socketPath) == 0 else {
            throw MacosHelperServiceError.transportUnavailable
        }
    }

    /** Authenticate before reading a bounded request from each connection. */
    private func acceptConnections() {
        while true {
            let connection = accept(listener, nil, nil)
            if connection < 0 { return }
            respond(connection: connection)
            close(connection)
        }
    }

    /** Compare kernel-provided audit credentials and validated code, not caller-supplied fields. */
    private func authenticate(connection: Int32) throws -> MacosHelperAuthenticatedClient {
        let started = DispatchTime.now().uptimeNanoseconds
        defer {
            let milliseconds = (DispatchTime.now().uptimeNanoseconds - started) / 1_000_000
            logger.info("peer verification duration-ms=\(milliseconds, privacy: .public)")
        }
        var userId: uid_t = 0
        var groupId: gid_t = 0
        guard getpeereid(connection, &userId, &groupId) == 0,
              userId == authentication.clientUserId else {
            throw MacosHelperServiceError.unauthorizedClient
        }
        guard case .production(let configuration, let clientRequirement) = authentication else {
            return .development
        }
        var token = [UInt32](repeating: 0, count: 8)
        var tokenLength = socklen_t(token.count * MemoryLayout<UInt32>.size)
        let tokenResult = token.withUnsafeMutableBytes {
            getsockopt(connection, SOL_LOCAL, LOCAL_PEERTOKEN, $0.baseAddress, &tokenLength)
        }
        guard tokenResult == 0, tokenLength == 32 else {
            throw MacosHelperServiceError.unauthorizedClient
        }
        let auditData = token.withUnsafeBytes { Data($0) }
        var guest: SecCode?
        let attributes = [kSecGuestAttributeAudit as String: auditData] as CFDictionary
                let lookupStatus = SecCodeCopyGuestWithAttributes(nil, attributes, [], &guest)
                let validationStatus = guest.map { SecCodeCheckValidity($0, .noNetworkAccess, clientRequirement) } ?? errSecCSNoSuchCode
                guard lookupStatus == errSecSuccess,
              let guest,
                            validationStatus == errSecSuccess else {
                        logger.error("peer code rejected: lookup=\(lookupStatus, privacy: .public) validity=\(validationStatus, privacy: .public)")
            throw MacosHelperServiceError.unauthorizedClient
        }
        var staticCode: SecStaticCode?
        var signingInfo: CFDictionary?
        guard SecCodeCopyStaticCode(guest, [], &staticCode) == errSecSuccess,
              let staticCode,
              SecCodeCopySigningInformation(
                staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &signingInfo
              ) == errSecSuccess,
              let info = signingInfo as? [String: Any],
              let executableURL = info[kSecCodeInfoMainExecutable as String] as? URL,
              (try? MacosHelperServiceConfiguration.canonicalPath(executableURL.path)) == configuration.clientExecutablePath else {
            logger.error("client executable identity rejected")
            throw MacosHelperServiceError.unauthorizedClient
        }
        return .production(guest, staticCode, info)
    }

    private func validateClientResources(_ client: MacosHelperAuthenticatedClient) throws {
        guard case .production(_, let staticCode, _) = client else { return }
        guard case .production(_, let clientRequirement) = authentication else {
            throw MacosHelperServiceError.unauthorizedClient
        }
        let started = DispatchTime.now().uptimeNanoseconds
        defer {
            let milliseconds = (DispatchTime.now().uptimeNanoseconds - started) / 1_000_000
            logger.info("resource verification duration-ms=\(milliseconds, privacy: .public)")
        }
        var codePath: CFURL?
        var diskCode: SecStaticCode?
        guard SecCodeCopyPath(staticCode, [], &codePath) == errSecSuccess,
              let codePath,
              SecStaticCodeCreateWithPath(codePath, [], &diskCode) == errSecSuccess,
              let diskCode else { throw MacosHelperServiceError.unauthorizedClient }
        guard SecStaticCodeCheckValidity(
            diskCode,
                        SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckNestedCode | SecCSFlags.noNetworkAccess.rawValue),
            clientRequirement
                ) == errSecSuccess,
                            SecStaticCodeCheckValidity(
                                diskCode,
                                SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckNestedCode | kSecCSCheckAllArchitectures | SecCSFlags.noNetworkAccess.rawValue),
                                nil
                            ) == errSecSuccess else {
            logger.error("client application resources rejected")
            throw MacosHelperServiceError.unauthorizedClient
        }
    }

    private func requireRuntimeProtection(client: SecCode) throws {
        var signingInfo: CFDictionary?
        guard SecCodeCopySigningInformation(
            unsafeBitCast(client, to: SecStaticCode.self),
            SecCSFlags(rawValue: kSecCSSigningInformation | kSecCSDynamicInformation), &signingInfo
        ) == errSecSuccess,
              let info = signingInfo as? [String: Any],
              let flags = info[kSecCodeInfoFlags as String] as? UInt32,
              SecCodeSignatureFlags(rawValue: flags).contains(.runtime),
              let status = info[kSecCodeInfoStatus as String] as? UInt32,
              SecCodeStatus(rawValue: status).contains(.valid),
              !SecCodeStatus(rawValue: status).contains(.debugged) else {
                        logger.error("client runtime protection rejected")
            throw MacosHelperServiceError.unauthorizedClient
        }
        let entitlements = info[kSecCodeInfoEntitlementsDict as String] as? [String: Any] ?? [:]
        for entitlement in [
            "com.apple.security.cs.allow-dyld-environment-variables",
            "com.apple.security.get-task-allow",
            "com.apple.security.cs.disable-executable-page-protection",
        ] where entitlements[entitlement] as? Bool == true {
            logger.error("client permits code injection or debugging")
            throw MacosHelperServiceError.unauthorizedClient
        }
    }

    /** Expose only implemented operations and preserve a structured failure for each request. */
    private func respond(connection: Int32) {
        var noSignal: Int32 = 1
        _ = setsockopt(connection, SOL_SOCKET, SO_NOSIGPIPE, &noSignal, socklen_t(MemoryLayout<Int32>.size))
        var timeout = timeval(tv_sec: 2, tv_usec: 0)
        _ = setsockopt(connection, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        _ = setsockopt(connection, SOL_SOCKET, SO_SNDTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
        _ = fcntl(connection, F_SETFL, 0)
        var requestId: String?
        do {
            let client = try authenticate(connection: connection)
            let request = try MacosHelperServiceRequest.decode(readRequest(connection: connection))
            requestId = request.requestId
            let value: [String: Any]
            switch request.operation {
            case "status":
                try validateClientResources(client)
                value = [
                    "processId": getpid(), "privileged": geteuid() == 0,
                    "clientAuthorizedForWrites": (try? requireWriteClient(client: client)) != nil,
                    "capabilities": ["status", "system-proxy.read", "system-proxy.read-effective", "system-proxy.replace", "certificate.import", "certificate.remove"],
                ]
            case "system-proxy.read":
                value = try SystemProxyHelper.readSystemProxySnapshot()
            case "system-proxy.read-effective":
                value = try SystemProxyHelper.readEffectiveSystemProxySettings()
            case "system-proxy.replace":
                guard let replacement = request.proxyReplacement else { throw MacosHelperServiceError.invalidRequest }
                try requireWriteClient(client: client)
                try validateClientResources(client)
                guard geteuid() == 0 else { throw MacosHelperServiceError.authorizationRequired }
                value = try SystemProxyHelper.replaceSystemProxySnapshot(replacement)
            case "certificate.import", "certificate.remove":
                guard let certificate = request.certificate else { throw MacosHelperServiceError.invalidRequest }
                try requireWriteClient(client: client)
                try validateClientResources(client)
                guard geteuid() == 0 else { throw MacosHelperServiceError.authorizationRequired }
                value = request.operation == "certificate.import"
                    ? try MacosSystemCertificateStore.importCertificate(certificate)
                    : try MacosSystemCertificateStore.removeCertificate(certificate)
            default:
                throw MacosHelperServiceError.unsupportedOperation
            }
            send([
                "protocolVersion": 1,
                "requestId": request.requestId,
                "ok": true,
                "value": value,
            ], connection: connection)
        } catch {
            let failure = (error as? MacosHelperServiceError) ?? .operationFailed
            logger.error("request rejected: \(failure.rawValue, privacy: .public)")
            send([
                "protocolVersion": 1,
                "requestId": requestId as Any? ?? NSNull(),
                "ok": false,
                "error": ["code": failure.rawValue],
            ], connection: connection)
        }
    }

    private func requireWriteClient(client: MacosHelperAuthenticatedClient) throws {
        guard case .production(let code, _, let signingInfo) = client else { return }
        guard case .production(let configuration, let clientRequirement) = authentication else {
            throw MacosHelperServiceError.unauthorizedClient
        }
        try requireRuntimeProtection(client: code)
        let executable = URL(fileURLWithPath: configuration.clientExecutablePath)
        let executableDirectory = executable.deletingLastPathComponent()
        let contentsDirectory = executableDirectory.deletingLastPathComponent()
        let applicationDirectory = contentsDirectory.deletingLastPathComponent()
        guard executableDirectory.lastPathComponent == "MacOS",
              contentsDirectory.lastPathComponent == "Contents",
              applicationDirectory.pathExtension == "app",
              executable.lastPathComponent == "Interceptor",
              signingInfo[kSecCodeInfoIdentifier as String] as? String == "com.zhxmt.interceptor",
              let metadata = signingInfo[kSecCodeInfoPList as String] as? [String: Any],
              metadata["CFBundleIdentifier"] as? String == "com.zhxmt.interceptor",
              metadata["CFBundleExecutable"] as? String == "Interceptor",
              SecCodeCheckValidity(code, .noNetworkAccess, clientRequirement) == errSecSuccess else {
                        logger.error("approved App resource or runtime identity rejected")
            throw MacosHelperServiceError.unauthorizedClient
        }
    }

    /** Read one small JSON frame without accepting unbounded input or extra frames. */
    private func readRequest(connection: Int32) throws -> Data {
        var request = Data()
        var buffer = [UInt8](repeating: 0, count: 1024)
        while true {
            let received = read(connection, &buffer, buffer.count)
            guard received > 0 else { throw MacosHelperServiceError.invalidRequest }
            request.append(contentsOf: buffer.prefix(received))
            guard request.count <= 262_144 else { throw MacosHelperServiceError.invalidRequest }
            if let newline = request.firstIndex(of: 0x0A) {
                guard newline == request.count - 1 else { throw MacosHelperServiceError.invalidRequest }
                return request.prefix(upTo: newline)
            }
        }
    }

    /** Write a bounded reply without terminating the service if a client disconnects. */
    private func send(_ response: [String: Any], connection: Int32) {
        guard var data = try? JSONSerialization.data(withJSONObject: response) else { return }
        data.append(0x0A)
        data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let written = write(connection, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if written <= 0 { return }
                offset += written
            }
        }
    }

    /** Remove only the endpoint created by this service when shutting down normally. */
    private func stop() {
        guard listener >= 0 else { return }
        listenerSource?.cancel()
        close(listener)
        listener = -1
        unlink(authentication.socketPath)
    }
}