import Darwin
import Foundation
import Security
import os

struct MacosTrustAuthorizationJournal {
    let original: [String: Any]
    let temporary: [String: Any]
}

enum MacosTrustAuthorizationError: Error, Equatable {
    case unavailable
    case restorationFailed
    case operationStateUncertain
}

class MacosTrustAuthorizationStore {
    private static let rightName = "com.apple.trust-settings.admin"
    private static let directory = "/Library/Application Support/Interceptor/PlatformHelper"
    private static let journalPath = directory + "/trust-authorization.plist"
    private let logger = Logger(subsystem: "com.zhxmt.interceptor.platform-capabilities", category: "certificate-authorization")

    func readRule() throws -> [String: Any] {
        var rule: CFDictionary?
        let result = AuthorizationRightGet(Self.rightName, &rule)
        guard result == errAuthorizationSuccess, let value = rule as? [String: Any] else {
            throw MacosTrustAuthorizationError.unavailable
        }
        return value
    }

    func writeRule(_ rule: [String: Any]) throws {
        guard getuid() == 0, geteuid() == 0 else { throw MacosTrustAuthorizationError.unavailable }
        var reference: AuthorizationRef?
        let created = AuthorizationCreate(nil, nil, [], &reference)
        guard created == errAuthorizationSuccess, let reference else {
            throw MacosTrustAuthorizationError.unavailable
        }
        defer { AuthorizationFree(reference, []) }
        let result = AuthorizationRightSet(reference, Self.rightName, rule as CFDictionary, nil, nil, nil)
        guard result == errAuthorizationSuccess else {
            logger.notice("fixed trust authorization rule write rejected: status=\(result, privacy: .public)")
            throw MacosTrustAuthorizationError.unavailable
        }
    }

    func readJournal() throws -> MacosTrustAuthorizationJournal? {
        var attributes = stat()
        if lstat(Self.journalPath, &attributes) != 0 {
            if errno == ENOENT { return nil }
            throw MacosTrustAuthorizationError.restorationFailed
        }
        try requireProtectedDirectory()
        guard attributes.st_mode & S_IFMT == S_IFREG, attributes.st_uid == 0,
              attributes.st_mode & 0o777 == 0o600, attributes.st_size <= 262_144 else {
            throw MacosTrustAuthorizationError.restorationFailed
        }
        let data = try Data(contentsOf: URL(fileURLWithPath: Self.journalPath))
        guard let record = try PropertyListSerialization.propertyList(from: data, format: nil) as? [String: Any],
              Set(record.keys) == Set(["original", "temporary"]),
              let original = record["original"] as? [String: Any],
              let temporary = record["temporary"] as? [String: Any] else {
            throw MacosTrustAuthorizationError.restorationFailed
        }
        return MacosTrustAuthorizationJournal(original: original, temporary: temporary)
    }

    func saveJournal(_ journal: MacosTrustAuthorizationJournal) throws {
        try requireProtectedDirectory()
        let data = try PropertyListSerialization.data(
            fromPropertyList: ["original": journal.original, "temporary": journal.temporary], format: .binary, options: 0
        )
        guard data.count <= 262_144 else { throw MacosTrustAuthorizationError.unavailable }
        let temporaryPath = Self.directory + "/.trust-authorization-" + UUID().uuidString
        let descriptor = open(temporaryPath, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW | O_CLOEXEC, 0o600)
        guard descriptor >= 0 else { throw MacosTrustAuthorizationError.unavailable }
        defer { close(descriptor); unlink(temporaryPath) }
        guard fchmod(descriptor, 0o600) == 0 else { throw MacosTrustAuthorizationError.unavailable }
        try data.withUnsafeBytes { bytes in
            var offset = 0
            while offset < bytes.count {
                let count = Darwin.write(descriptor, bytes.baseAddress!.advanced(by: offset), bytes.count - offset)
                if count < 0 && errno == EINTR { continue }
                guard count > 0 else { throw MacosTrustAuthorizationError.unavailable }
                offset += count
            }
        }
        guard fsync(descriptor) == 0, link(temporaryPath, Self.journalPath) == 0 else {
            throw MacosTrustAuthorizationError.unavailable
        }
        try syncDirectory()
    }

    func clearJournal() throws {
        try requireProtectedDirectory()
        guard unlink(Self.journalPath) == 0 || errno == ENOENT else {
            throw MacosTrustAuthorizationError.restorationFailed
        }
        try syncDirectory()
    }

    static func requireNoPendingRecovery() throws {
        var attributes = stat()
        guard lstat(journalPath, &attributes) != 0, errno == ENOENT else {
            throw MacosTrustAuthorizationError.restorationFailed
        }
    }

    private func requireProtectedDirectory() throws {
        guard getuid() == 0, geteuid() == 0 else { throw MacosTrustAuthorizationError.unavailable }
        var directory = Self.directory
        while true {
            var attributes = stat()
            guard lstat(directory, &attributes) == 0, attributes.st_mode & S_IFMT == S_IFDIR,
                  attributes.st_uid == 0, attributes.st_mode & 0o022 == 0 else {
                throw MacosTrustAuthorizationError.restorationFailed
            }
            if directory == "/" { return }
            directory = (directory as NSString).deletingLastPathComponent
        }
    }

    private func syncDirectory() throws {
        let descriptor = open(Self.directory, O_RDONLY | O_DIRECTORY | O_NOFOLLOW | O_CLOEXEC)
        guard descriptor >= 0 else { throw MacosTrustAuthorizationError.restorationFailed }
        defer { close(descriptor) }
        guard fsync(descriptor) == 0 else { throw MacosTrustAuthorizationError.restorationFailed }
    }
}

final class MacosTrustAuthorization {
    private let store: MacosTrustAuthorizationStore

    init(store: MacosTrustAuthorizationStore = MacosTrustAuthorizationStore()) {
        self.store = store
    }

    func perform<Value>(_ operation: () throws -> Value) throws -> Value {
        try restore()
        let original: [String: Any]
        do { original = try store.readRule() }
        catch { throw MacosTrustAuthorizationError.unavailable }
        guard let temporary = temporaryRule(original) else { throw MacosTrustAuthorizationError.unavailable }
        if equalRules(original, temporary) {
            return try operation()
        }
        let journal = MacosTrustAuthorizationJournal(original: original, temporary: temporary)
        do { try store.saveJournal(journal) }
        catch {
            try restore()
            guard let current = try? store.readRule(), equalRules(current, original) else {
                throw MacosTrustAuthorizationError.restorationFailed
            }
            throw MacosTrustAuthorizationError.unavailable
        }
        do {
            guard equalRules(try store.readRule(), original) else { throw MacosTrustAuthorizationError.restorationFailed }
            try store.writeRule(temporary)
            guard equalRules(try store.readRule(), temporary) else { throw MacosTrustAuthorizationError.unavailable }
        } catch {
            try restore(journal)
            throw MacosTrustAuthorizationError.unavailable
        }
        let result = Result(catching: operation)
        try restore(journal)
        return try result.get()
    }

    func restore() throws {
        do {
            guard let journal = try store.readJournal() else { return }
            try restore(journal)
        } catch {
            throw MacosTrustAuthorizationError.restorationFailed
        }
    }

    private func restore(_ journal: MacosTrustAuthorizationJournal) throws {
        do {
            let current = try store.readRule()
            if !equalRules(current, journal.original) {
                guard equalRules(current, journal.temporary) else { throw MacosTrustAuthorizationError.restorationFailed }
                try store.writeRule(journal.original)
                guard equalRules(try store.readRule(), journal.original) else { throw MacosTrustAuthorizationError.restorationFailed }
            }
            try store.clearJournal()
        } catch {
            throw MacosTrustAuthorizationError.restorationFailed
        }
    }

    private func temporaryRule(_ original: [String: Any]) -> [String: Any]? {
        var rule = original
        guard original["class"] as? String == "rule", original["k-of-n"] as? Int == 1,
              let delegates = original["rule"] as? [String], !delegates.isEmpty else { return nil }
        if !delegates.contains("is-root") { rule["rule"] = ["is-root"] + delegates }
        return rule
    }

    private func equalRules(_ left: [String: Any], _ right: [String: Any]) -> Bool {
        let timestamps: Set<String> = ["created", "modified"]
        return NSDictionary(dictionary: left.filter { !timestamps.contains($0.key) })
            .isEqual(to: right.filter { !timestamps.contains($0.key) })
    }
}