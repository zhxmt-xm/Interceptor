import Darwin
import AppKit
import Foundation
import Security

enum MacosHelperInstallation {
    static let installationDirectory = "/Library/Application Support/Interceptor/PlatformHelper"
    static let helperPath = "/Library/PrivilegedHelperTools/com.zhxmt.interceptor.platform-capabilities"
    static let configurationPath = installationDirectory + "/service.json"
    static let socketPath = installationDirectory + "/service.sock"
    static let developmentConfigurationPath = installationDirectory + "/development.json"
    static let developmentSocketPath = installationDirectory + "/development.sock"
    static let serviceLabel = "com.zhxmt.interceptor.platform-capabilities"
    static let launchDaemonPath = "/Library/LaunchDaemons/" + serviceLabel + ".plist"

    static func requestInstallation(
        applicationPath: String, userId: uid_t, clientRequirement: String, helperRequirement: String
    ) throws {
        guard getuid() != 0, geteuid() == getuid(), userId == getuid(), userId == (try consoleUserId()) else {
            throw MacosInstallationError.noConsoleUser
        }
        let identity = try inspectApplication(path: applicationPath)
        guard identity["clientRequirement"] as? String == clientRequirement,
              identity["helperRequirement"] as? String == helperRequirement,
              let executablePath = Bundle.main.executableURL?.path,
              try MacosHelperServiceConfiguration.canonicalPath(executablePath)
                == MacosHelperServiceConfiguration.canonicalPath(applicationPath + "/Contents/Resources/system-proxy/macos-proxy-helper") else {
            throw MacosInstallationError.applicationBuildMismatch
        }
        let sourcePath = try MacosHelperServiceConfiguration.canonicalPath(executablePath)
        try requestAuthorizedDeployment(sourcePath: sourcePath, helperRequirement: helperRequirement,
            arguments: ["install-helper", applicationPath, String(userId), clientRequirement, helperRequirement])
    }

    static func requestDevelopmentInstallation(userId: uid_t, helperRequirement: String) throws {
        guard getuid() != 0, geteuid() == getuid(), userId == getuid(), userId == (try consoleUserId()) else {
            throw MacosInstallationError.noConsoleUser
        }
        guard let executablePath = Bundle.main.executableURL?.path,
              try readCodeRequirement(path: executablePath) == helperRequirement else {
            throw MacosInstallationError.applicationBuildMismatch
        }
        try requestAuthorizedDeployment(
            sourcePath: MacosHelperServiceConfiguration.canonicalPath(executablePath),
            helperRequirement: helperRequirement,
            arguments: ["install-development-helper", String(userId), helperRequirement])
    }

    private static func requestAuthorizedDeployment(sourcePath: String, helperRequirement: String, arguments: [String]) throws {
        let command = [
            "set -eu",
            "umask 077",
            "staging_directory=$(/usr/bin/mktemp -d /private/tmp/interceptor-helper-deploy.XXXXXXXX)",
            "trap '/bin/rm -rf \"$staging_directory\"' EXIT",
            "/bin/cp -X \(shellArgument(sourcePath)) \"$staging_directory/helper\"",
            "/usr/sbin/chown root:wheel \"$staging_directory/helper\"",
            "/bin/chmod 0500 \"$staging_directory/helper\"",
            "/usr/bin/codesign --verify --strict --all-architectures --requirement \(shellArgument(helperRequirement)) \"$staging_directory/helper\"",
            "\"$staging_directory/helper\" \(arguments.map(shellArgument).joined(separator: " "))",
        ].joined(separator: "\n")
        let scriptCommand = command.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: "\"", with: "\\\"")
            .replacingOccurrences(of: "\r", with: "\\r")
            .replacingOccurrences(of: "\n", with: "\\n")
        guard let script = NSAppleScript(source: "do shell script \"\(scriptCommand)\" with administrator privileges") else {
            throw MacosInstallationError.authorizationFailed
        }
        try withForegroundAuthorization {
            var error: NSDictionary?
            _ = script.executeAndReturnError(&error)
            if error != nil {
                if error?[NSAppleScript.errorNumber] as? Int == -128 { throw MacosInstallationError.authorizationCancelled }
                throw MacosInstallationError.authorizationFailed
            }
        }
    }

    static func withForegroundAuthorization<Value>(_ operation: () throws -> Value) throws -> Value {
        guard getuid() != 0, geteuid() == getuid(), getuid() == (try consoleUserId()) else {
            throw MacosHelperServiceError.authorizationRequired
        }
        let application = NSApplication.shared
        guard application.setActivationPolicy(.accessory) else { throw MacosInstallationError.authorizationFocusFailed }
        application.activate(ignoringOtherApps: true)
        let deadline = Date().addingTimeInterval(2)
        while !NSRunningApplication.current.isActive && Date() < deadline {
            _ = RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.02))
        }
        guard NSRunningApplication.current.isActive else { throw MacosInstallationError.authorizationFocusFailed }
        defer { application.deactivate() }
        return try operation()
    }

    private static func shellArgument(_ value: String) -> String {
        "'" + value.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }

    static func inspectHelper() throws -> [String: Any] {
        guard let executablePath = Bundle.main.executableURL?.path else { throw MacosInstallationError.invalidSignature }
        return ["helperRequirement": try readCodeRequirement(path: executablePath)]
    }

    static func inspectApplication(path: String) throws -> [String: Any] {
        guard path.hasPrefix("/"), path.hasSuffix(".app"),
              let canonicalPath = try? MacosHelperServiceConfiguration.canonicalPath(path),
              let application = Bundle(path: canonicalPath),
              application.bundleIdentifier == "com.zhxmt.interceptor",
              let executablePath = application.executableURL?.path,
              (try? MacosHelperServiceConfiguration.canonicalPath(executablePath)) == canonicalPath + "/Contents/MacOS/Interceptor",
              let version = application.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
              !version.isEmpty else {
            throw MacosInstallationError.invalidApplication
        }
        var staticCode: SecStaticCode?
        var signingInfo: CFDictionary?
        guard SecStaticCodeCreateWithPath(URL(fileURLWithPath: canonicalPath) as CFURL, [], &staticCode) == errSecSuccess,
              let staticCode,
              SecStaticCodeCheckValidity(
                staticCode,
                SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckNestedCode | kSecCSCheckAllArchitectures), nil
              ) == errSecSuccess,
              SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &signingInfo) == errSecSuccess,
              let information = signingInfo as? [String: Any],
              let flags = information[kSecCodeInfoFlags as String] as? UInt32,
              SecCodeSignatureFlags(rawValue: flags).contains(.runtime),
              let codeHash = information[kSecCodeInfoUnique as String] as? Data else {
            throw MacosInstallationError.invalidSignature
        }
        let entitlements = information[kSecCodeInfoEntitlementsDict as String] as? [String: Any] ?? [:]
        for key in [
            "com.apple.security.cs.allow-dyld-environment-variables",
            "com.apple.security.get-task-allow",
            "com.apple.security.cs.disable-executable-page-protection",
        ] where entitlements[key] as? Bool == true {
            throw MacosInstallationError.invalidSignature
        }
        let helperPath = canonicalPath + "/Contents/Resources/system-proxy/macos-proxy-helper"
        guard FileManager.default.isExecutableFile(atPath: helperPath) else {
            throw MacosInstallationError.invalidApplication
        }
        let digest = codeHash.map { String(format: "%02x", $0) }.joined()
        return [
            "bundleIdentifier": "com.zhxmt.interceptor",
            "bundleVersion": version,
            "clientRequirement": "cdhash H\"\(digest)\"",
            "helperRequirement": try readCodeRequirement(path: helperPath),
        ]
    }

    static func deploymentStatus(applicationPath: String, userId: uid_t) throws -> [String: Any] {
        let identity = try inspectApplication(path: applicationPath)
        guard userId >= 501, userId == getuid(), getpwuid(userId) != nil else {
            throw MacosInstallationError.noConsoleUser
        }
        do {
            guard try installedComponentExists(), try pathExists(path: configurationPath) else { return ["state": "missing"] }
            let configuration = try MacosHelperServiceConfiguration.load(path: configurationPath, ownerUserId: 0)
            guard configuration.socketPath == socketPath else { return ["state": "invalid"] }
            let executablePath = try MacosHelperServiceConfiguration.canonicalPath(applicationPath) + "/Contents/MacOS/Interceptor"
            let installedHelperRequirement = try readCodeRequirement(path: helperPath)
            if configuration.clientExecutablePath != executablePath || configuration.clientUserId != userId
                || configuration.clientRequirement != identity["clientRequirement"] as? String
                || installedHelperRequirement != identity["helperRequirement"] as? String {
                return ["state": "outdated"]
            }
            return ["state": isRootServiceReachable(path: socketPath) ? "ready" : "stopped"]
        } catch {
            return ["state": "invalid"]
        }
    }

    static func developmentDeploymentStatus(userId: uid_t) throws -> [String: Any] {
        guard userId >= 501, userId == getuid(), getpwuid(userId) != nil else {
            throw MacosInstallationError.noConsoleUser
        }
        let identity = try inspectHelper()
        do {
            guard try installedComponentExists(), try pathExists(path: developmentConfigurationPath) else { return ["state": "missing"] }
            let configuration = try MacosHelperDevelopmentConfiguration.load(path: developmentConfigurationPath, ownerUserId: 0)
            guard configuration.socketPath == developmentSocketPath else { return ["state": "invalid"] }
            let installedHelperRequirement = try readCodeRequirement(path: helperPath)
            if configuration.clientUserId != userId
                || installedHelperRequirement != identity["helperRequirement"] as? String {
                return ["state": "outdated"]
            }
            return ["state": isRootServiceReachable(path: developmentSocketPath) ? "ready" : "stopped"]
        } catch {
            return ["state": "invalid"]
        }
    }

    private static func installedComponentExists() throws -> Bool {
        try requireProtectedAncestors(path: "/Library/Application Support")
        try requireProtectedAncestors(path: "/Library/LaunchDaemons")
        let existing = try [helperPath, configurationPath, developmentConfigurationPath, launchDaemonPath]
            .filter { try pathExists(path: $0) }
        if existing.isEmpty { return false }
        for path in existing {
            try requireProtectedAncestors(path: (path as NSString).deletingLastPathComponent)
            try validateExistingFile(path: path)
        }
        guard try pathExists(path: helperPath), try pathExists(path: launchDaemonPath) else {
            throw MacosInstallationError.unprotectedInstallation
        }
        try validateExistingLaunchDaemon()
        return true
    }

    static func installHelper(
        applicationPath: String, userId: uid_t, clientRequirement: String, helperRequirement: String
    ) throws {
        guard geteuid() == 0 else { throw MacosInstallationError.authorizationRequired }
        guard userId == (try consoleUserId()) else { throw MacosInstallationError.noConsoleUser }
        let identity = try inspectApplication(path: applicationPath)
        guard identity["clientRequirement"] as? String == clientRequirement,
              identity["helperRequirement"] as? String == helperRequirement else {
            throw MacosInstallationError.applicationBuildMismatch
        }
        let executablePath = try MacosHelperServiceConfiguration.canonicalPath(applicationPath) + "/Contents/MacOS/Interceptor"
        try deployHelper(userId: userId, helperRequirement: helperRequirement, targetConfigurationPath: configurationPath,
            targetSocketPath: socketPath, configuration: [
                "protocolVersion": 1, "socketPath": socketPath, "clientUserId": userId,
                "clientExecutablePath": executablePath, "clientRequirement": clientRequirement,
            ])
    }

    static func installDevelopmentHelper(userId: uid_t, helperRequirement: String) throws {
        guard geteuid() == 0 else { throw MacosInstallationError.authorizationRequired }
        guard userId == (try consoleUserId()) else { throw MacosInstallationError.noConsoleUser }
        try deployHelper(userId: userId, helperRequirement: helperRequirement, targetConfigurationPath: developmentConfigurationPath,
            targetSocketPath: developmentSocketPath, configuration: [
                "protocolVersion": 1, "socketPath": developmentSocketPath, "clientUserId": userId,
            ])
    }

    private static func deployHelper(
        userId: uid_t, helperRequirement: String, targetConfigurationPath: String,
        targetSocketPath: String, configuration: [String: Any]
    ) throws {
        guard let executableURL = Bundle.main.executableURL else { throw MacosInstallationError.invalidSignature }
        let sourcePath = try MacosHelperServiceConfiguration.canonicalPath(executableURL.path)
        try validateExistingFile(path: sourcePath)
        var sourceDirectory = stat()
        let sourceParent = (sourcePath as NSString).deletingLastPathComponent
        guard lstat(sourceParent, &sourceDirectory) == 0, sourceDirectory.st_uid == 0,
              sourceDirectory.st_mode & 0o077 == 0,
              try readCodeRequirement(path: sourcePath) == helperRequirement else {
            throw MacosInstallationError.unprotectedInstallation
        }
        try rejectGrantingACL(path: sourceParent)
        try createProtectedDirectory(path: "/Library/Application Support/Interceptor")
        try createProtectedDirectory(path: installationDirectory)
        try createProtectedDirectory(path: "/Library/PrivilegedHelperTools")
        try requireProtectedAncestors(path: "/Library/LaunchDaemons")
        for path in [helperPath, configurationPath, developmentConfigurationPath, launchDaemonPath] { try validateExistingFile(path: path) }
        try validateExistingLaunchDaemon()

        let lockPath = installationDirectory + "/deployment.lock"
        let descriptor = open(lockPath, O_CREAT | O_RDWR | O_NOFOLLOW, 0o600)
        guard descriptor >= 0 else { throw MacosInstallationError.unprotectedInstallation }
        defer { close(descriptor) }
        guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else { throw MacosInstallationError.deploymentBusy }
        defer { flock(descriptor, LOCK_UN) }
        try requireRestoredSystemProxy()
        let previousEndpoints = try configuredEndpoints()
        let launchDaemon: [String: Any] = [
            "Label": serviceLabel,
            "ProgramArguments": [helperPath, "serve", configurationPath],
            "RunAtLoad": true,
            "KeepAlive": true,
            "UserName": "root",
            "GroupName": "wheel",
            "ProcessType": "Interactive",
            "ThrottleInterval": 5,
            "ExitTimeOut": 15,
            "Umask": 0o077,
        ]
        let previousFiles = try [helperPath, configurationPath, developmentConfigurationPath, launchDaemonPath].map { path -> (String, Data?) in
            (path, try pathExists(path: path) ? Data(contentsOf: URL(fileURLWithPath: path)) : nil)
        }
        let previouslyRegistered = try serviceRegistered()
        let previousMask = umask(0o077)
        defer { umask(previousMask) }
        try stopRegisteredService()
        var deployedEndpoints = previousEndpoints
        deployedEndpoints[targetSocketPath] = userId
        do {
            for (path, userId) in previousEndpoints { try removeEndpoint(path: path, userId: userId) }
            let helperData = try Data(contentsOf: URL(fileURLWithPath: sourcePath))
            if previousFiles.first?.1 != helperData {
                try writeProtectedFile(data: helperData, path: helperPath, mode: 0o555)
            }
            guard try readCodeRequirement(path: helperPath) == helperRequirement else { throw MacosInstallationError.invalidSignature }
            try writeProtectedFile(data: JSONSerialization.data(withJSONObject: configuration, options: [.sortedKeys]), path: targetConfigurationPath, mode: 0o644)
            try writeProtectedFile(data: PropertyListSerialization.data(fromPropertyList: launchDaemon, format: .xml, options: 0), path: launchDaemonPath, mode: 0o644)
            _ = try configuredEndpoints()
            guard try runSystemTool("/bin/launchctl", ["bootstrap", "system", launchDaemonPath]) == 0 else {
                throw MacosInstallationError.serviceRegistrationFailed
            }
            for _ in 0..<100 {
                if isRootServiceReachable(path: targetSocketPath) { return }
                _ = poll(nil, 0, 100)
            }
            throw MacosInstallationError.serviceRegistrationFailed
        } catch {
            try stopRegisteredService()
            for (path, userId) in deployedEndpoints { try removeEndpoint(path: path, userId: userId) }
            for (path, previous) in previousFiles {
                if let previous { try writeProtectedFile(data: previous, path: path, mode: path == helperPath ? 0o555 : 0o644) }
                else if try pathExists(path: path) { try FileManager.default.removeItem(atPath: path) }
            }
            if previouslyRegistered,
               try runSystemTool("/bin/launchctl", ["bootstrap", "system", launchDaemonPath]) != 0 {
                throw MacosInstallationError.rollbackFailed
            }
            throw error
        }
    }

    static func uninstallHelper() throws {
        guard geteuid() == 0 else { throw MacosInstallationError.authorizationRequired }
        try requireProtectedAncestors(path: installationDirectory)
        try requireProtectedAncestors(path: "/Library/PrivilegedHelperTools")
        try requireProtectedAncestors(path: "/Library/LaunchDaemons")
        try validateExistingFile(path: helperPath)
        try validateExistingFile(path: configurationPath)
        try validateExistingFile(path: developmentConfigurationPath)
        try validateExistingLaunchDaemon()
        let endpoints = try configuredEndpoints()
        try requireRestoredSystemProxy()
        try stopRegisteredService()
        for (path, userId) in endpoints { try removeEndpoint(path: path, userId: userId) }
        for path in [helperPath, configurationPath, developmentConfigurationPath, launchDaemonPath, installationDirectory + "/deployment.lock"] {
            try validateExistingFile(path: path)
            if try pathExists(path: path) { try FileManager.default.removeItem(atPath: path) }
        }
        if try FileManager.default.contentsOfDirectory(atPath: installationDirectory).isEmpty {
            try FileManager.default.removeItem(atPath: installationDirectory)
        }
    }

    private static func requireRestoredSystemProxy() throws {
        let snapshot = try SystemProxyHelper.readSystemProxySnapshot()
        for service in snapshot["services"] as? [[String: Any]] ?? [] {
            let settings = service["settings"] as? [String: Any] ?? [:]
            for protocolName in ["HTTP", "HTTPS"] {
                if settings[protocolName + "Enable"] as? Int == 1,
                   settings[protocolName + "Port"] as? Int == 8888,
                   let host = settings[protocolName + "Proxy"] as? String,
                   ["127.0.0.1", "::1"].contains(host) {
                    throw MacosInstallationError.proxyNotRestored
                }
            }
        }
    }

    private static func configuredEndpoints() throws -> [String: uid_t] {
        var endpoints: [String: uid_t] = [:]
        if try pathExists(path: configurationPath) {
            let configuration = try MacosHelperServiceConfiguration.load(path: configurationPath, ownerUserId: 0)
            guard configuration.socketPath == socketPath else { throw MacosInstallationError.unprotectedInstallation }
            endpoints[socketPath] = configuration.clientUserId
        }
        if try pathExists(path: developmentConfigurationPath) {
            let configuration = try MacosHelperDevelopmentConfiguration.load(path: developmentConfigurationPath, ownerUserId: 0)
            guard configuration.socketPath == developmentSocketPath else { throw MacosInstallationError.unprotectedInstallation }
            endpoints[developmentSocketPath] = configuration.clientUserId
        }
        return endpoints
    }

    private static func readCodeRequirement(path: String) throws -> String {
        var staticCode: SecStaticCode?
        var signingInfo: CFDictionary?
        guard SecStaticCodeCreateWithPath(URL(fileURLWithPath: path) as CFURL, [], &staticCode) == errSecSuccess,
              let staticCode,
              SecStaticCodeCheckValidity(staticCode, SecCSFlags(rawValue: kSecCSStrictValidate | kSecCSCheckAllArchitectures), nil) == errSecSuccess,
              SecCodeCopySigningInformation(staticCode, SecCSFlags(rawValue: kSecCSSigningInformation), &signingInfo) == errSecSuccess,
              let information = signingInfo as? [String: Any],
              let flags = information[kSecCodeInfoFlags as String] as? UInt32,
              SecCodeSignatureFlags(rawValue: flags).contains(.runtime),
              let codeHash = information[kSecCodeInfoUnique as String] as? Data else {
            throw MacosInstallationError.invalidSignature
        }
        return "cdhash H\"\(codeHash.map { String(format: "%02x", $0) }.joined())\""
    }

    private static func stopRegisteredService() throws {
        guard try serviceRegistered() else { return }
        guard try runSystemTool("/bin/launchctl", ["bootout", "system/" + serviceLabel]) == 0 else {
            throw MacosInstallationError.serviceRegistrationFailed
        }
    }

    private static func serviceRegistered() throws -> Bool {
        let result = try runSystemTool("/bin/launchctl", ["print", "system/" + serviceLabel])
        if result == 113 { return false }
        if result == 0 { return true }
        throw MacosInstallationError.serviceRegistrationFailed
    }

    private static func isRootServiceReachable(path: String) -> Bool {
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        address.sun_len = UInt8(MemoryLayout<sockaddr_un>.size)
        let bytes = Array(path.utf8CString)
        guard bytes.count <= MemoryLayout.size(ofValue: address.sun_path) else { return false }
        withUnsafeMutableBytes(of: &address.sun_path) { $0.copyBytes(from: bytes.map { UInt8(bitPattern: $0) }) }
        let connection = socket(AF_UNIX, SOCK_STREAM, 0)
        guard connection >= 0 else { return false }
        defer { close(connection) }
        guard fcntl(connection, F_SETFL, O_NONBLOCK) == 0 else { return false }
        let connected = withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                connect(connection, $0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
        var userId: uid_t = 0
        var groupId: gid_t = 0
        return connected == 0 && getpeereid(connection, &userId, &groupId) == 0 && userId == 0
    }

    private static func createProtectedDirectory(path: String) throws {
        try requireProtectedAncestors(path: (path as NSString).deletingLastPathComponent)
        if !(try pathExists(path: path)) {
            guard mkdir(path, 0o755) == 0, chmod(path, 0o755) == 0 else {
                throw MacosInstallationError.unprotectedInstallation
            }
        }
        try requireProtectedAncestors(path: path)
    }

    private static func writeProtectedFile(data: Data, path: String, mode: mode_t) throws {
        try validateExistingFile(path: path)
        try data.write(to: URL(fileURLWithPath: path), options: .atomic)
        guard chmod(path, mode) == 0 else { throw MacosInstallationError.unprotectedInstallation }
    }

    private static func removeEndpoint(path: String, userId: uid_t) throws {
        var attributes = stat()
        if lstat(path, &attributes) == 0 {
            guard attributes.st_mode & S_IFMT == S_IFSOCK,
                  attributes.st_uid == 0 || attributes.st_uid == userId,
                  unlink(path) == 0 else { throw MacosInstallationError.unprotectedInstallation }
        } else if errno != ENOENT { throw MacosInstallationError.unprotectedInstallation }
    }

    private static func requireProtectedAncestors(path: String) throws {
        var directory = path
        repeat {
            var attributes = stat()
            guard lstat(directory, &attributes) == 0,
                  attributes.st_mode & S_IFMT == S_IFDIR,
                  attributes.st_uid == 0, attributes.st_mode & 0o022 == 0 else {
                throw MacosInstallationError.unprotectedInstallation
            }
            try rejectGrantingACL(path: directory)
            if directory == "/" { break }
            directory = (directory as NSString).deletingLastPathComponent
        } while true
    }

    private static func rejectGrantingACL(path: String) throws {
        guard let permissions = acl_get_file(path, ACL_TYPE_EXTENDED) else {
            let aclError = errno
            var attributes = stat()
            if aclError == ENOENT && lstat(path, &attributes) == 0 { return }
            throw MacosInstallationError.unprotectedInstallation
        }
        defer { acl_free(UnsafeMutableRawPointer(permissions)) }
        var entry: acl_entry_t?
        var entryId = ACL_FIRST_ENTRY
        while acl_get_entry(permissions, Int32(entryId.rawValue), &entry) == 0 {
            entryId = ACL_NEXT_ENTRY
            var tag = ACL_UNDEFINED_TAG
            guard let entry, acl_get_tag_type(entry, &tag) == 0, tag == ACL_EXTENDED_DENY else {
                throw MacosInstallationError.unprotectedInstallation
            }
        }
    }

    private static func validateExistingFile(path: String) throws {
        var attributes = stat()
        if lstat(path, &attributes) != 0 {
            if errno == ENOENT { return }
            throw MacosInstallationError.unprotectedInstallation
        }
        guard attributes.st_mode & S_IFMT == S_IFREG,
              attributes.st_uid == 0, attributes.st_mode & 0o022 == 0 else {
            throw MacosInstallationError.unprotectedInstallation
        }
        try rejectGrantingACL(path: path)
    }

    private static func validateExistingLaunchDaemon() throws {
        try validateExistingFile(path: launchDaemonPath)
        guard try pathExists(path: launchDaemonPath) else { return }
        let data = try Data(contentsOf: URL(fileURLWithPath: launchDaemonPath))
        guard let configuration = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              configuration["Label"] as? String == serviceLabel,
                            configuration["ProgramArguments"] as? [String] == [helperPath, "serve", configurationPath]
                else { throw MacosInstallationError.unprotectedInstallation }
    }

    private static func pathExists(path: String) throws -> Bool {
        var attributes = stat()
        if lstat(path, &attributes) == 0 { return true }
        if errno == ENOENT { return false }
        throw MacosInstallationError.unprotectedInstallation
    }

    private static func consoleUserId() throws -> uid_t {
        var attributes = stat()
        guard stat("/dev/console", &attributes) == 0,
              attributes.st_uid >= 501, attributes.st_uid < uid_t.max,
              getpwuid(attributes.st_uid) != nil else {
            throw MacosInstallationError.noConsoleUser
        }
        return attributes.st_uid
    }

    private static func runSystemTool(_ executable: String, _ arguments: [String]) throws -> Int32 {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: executable)
        process.arguments = arguments
        process.environment = ["PATH": "/usr/bin:/bin:/usr/sbin:/sbin", "LANG": "en_US.UTF-8"]
        process.standardInput = FileHandle.nullDevice
        process.standardOutput = FileHandle.nullDevice
        process.standardError = FileHandle.nullDevice
        try process.run()
        process.waitUntilExit()
        guard process.terminationReason == .exit else { throw MacosInstallationError.serviceRegistrationFailed }
        return process.terminationStatus
    }
}

private enum MacosInstallationError: String, Error, CustomStringConvertible {
    case authorizationRequired = "installation requires administrator privileges"
    case authorizationFailed = "helper installation authorization failed"
    case authorizationCancelled = "helper installation authorization cancelled"
    case authorizationFocusFailed = "unable to focus the helper installation authorization"
    case invalidApplication = "deployment requires the signed Interceptor application"
    case invalidSignature = "application signature is invalid"
    case applicationBuildMismatch = "the bundled helper does not match the approved application"
    case unprotectedInstallation = "installation paths must be root-owned and protected"
    case noConsoleUser = "installation requires a logged-in local user"
    case serviceRegistrationFailed = "system service registration failed"
    case rollbackFailed = "helper deployment and previous service recovery failed"
    case deploymentBusy = "another helper deployment is in progress"
    case proxyNotRestored = "restore the system proxy in Interceptor before uninstalling"

    var description: String { rawValue }
}