import Foundation

private let originalRule: [String: Any] = [
    "class": "rule", "k-of-n": 1, "rule": ["entitled", "authenticate-admin"],
    "created": 1.0, "modified": 2.0, "version": 1, "comment": "original policy"
]

private var temporaryRule: [String: Any] {
    var rule = originalRule
    rule["rule"] = ["is-root", "entitled", "authenticate-admin"]
    return rule
}

private enum TestFailure: Error {
    case assertion(String)
    case injected
}

private func require(_ condition: Bool, _ message: String) throws {
    if !condition { throw TestFailure.assertion(message) }
}

private func equalRules(_ left: [String: Any], _ right: [String: Any]) -> Bool {
    let ignored: Set<String> = ["created", "modified"]
    return NSDictionary(dictionary: left.filter { !ignored.contains($0.key) })
        .isEqual(to: right.filter { !ignored.contains($0.key) })
}

private final class FakeMacosTrustAuthorizationStore: MacosTrustAuthorizationStore {
    var currentRule = originalRule
    var journal: MacosTrustAuthorizationJournal?
    var writes: [[String: Any]] = []
    var rejectWriteAt = 0
    var failAfterWriteAt = 0
    var rejectSave = false
    var rejectRead = false
    var events: [String] = []

    override func readRule() throws -> [String: Any] {
        if rejectRead { throw TestFailure.injected }
        return currentRule
    }

    override func writeRule(_ rule: [String: Any]) throws {
        events.append("write")
        writes.append(rule)
        if writes.count == rejectWriteAt { throw TestFailure.injected }
        currentRule = rule
        currentRule["modified"] = Double(writes.count + 10)
        if writes.count == failAfterWriteAt { throw TestFailure.injected }
    }

    override func readJournal() throws -> MacosTrustAuthorizationJournal? { journal }

    override func saveJournal(_ record: MacosTrustAuthorizationJournal) throws {
        if rejectSave { throw TestFailure.injected }
        events.append("save")
        journal = record
    }

    override func clearJournal() throws {
        events.append("clear")
        journal = nil
    }
}

@main
private struct NativeTrustAuthorizationTests {
    static func main() throws {
        let scenario = CommandLine.arguments[1]
        var result: [String: Any] = ["scenario": scenario]
        do {
            try run(scenario)
            result["passed"] = true
        } catch {
            result["passed"] = false
            result["failure"] = String(describing: error)
        }
        FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: result))
    }

    private static func run(_ scenario: String) throws {
        let store = FakeMacosTrustAuthorizationStore()
        let authorization = MacosTrustAuthorization(store: store)
        var operationCalled = false
        var caught: MacosTrustAuthorizationError?
        if scenario.hasPrefix("recover-") {
            store.journal = MacosTrustAuthorizationJournal(original: originalRule, temporary: temporaryRule)
            store.currentRule = scenario == "recover-original" ? originalRule : temporaryRule
            if scenario == "recover-external" { store.currentRule["comment"] = "external policy" }
            if scenario == "recover-write-failure" { store.rejectWriteAt = 1 }
            do { try authorization.restore() }
            catch let error as MacosTrustAuthorizationError { caught = error }
            if scenario == "recover-external" || scenario == "recover-write-failure" {
                try require(caught == .restorationFailed && store.journal != nil, "Recovery failure must retain the journal and block fallback")
                if scenario == "recover-external" { try require(store.writes.isEmpty, "External rules must not be overwritten") }
            } else {
                try require(caught == nil && store.journal == nil && equalRules(store.currentRule, originalRule), "Interrupted rules must be restored")
                try require(store.writes.count == (scenario == "recover-original" ? 0 : 1), "Recovery must not rewrite an already restored rule")
            }
            return
        }
        if scenario == "modify-denied" { store.rejectWriteAt = 1 }
        if scenario == "modify-partial-failure" { store.failAfterWriteAt = 1 }
        if scenario == "restore-write-failure" { store.rejectWriteAt = 2 }
        if scenario == "backup-failure" { store.rejectSave = true }
        if scenario == "already-root" { store.currentRule = temporaryRule }
        if scenario == "unsupported-policy" { store.currentRule = ["class": "deny"] }
        let startingRule = store.currentRule
        do {
            let value = try authorization.perform {
                operationCalled = true
                store.events.append("operation")
                try require(equalRules(store.currentRule, temporaryRule), "Operation must run with only the expected root condition")
                if scenario == "operation-failure" { throw MacosTrustAuthorizationError.unavailable }
                if scenario == "operation-state-uncertain" { throw MacosTrustAuthorizationError.operationStateUncertain }
                if scenario == "external-change" { store.currentRule["comment"] = "external policy" }
                if scenario == "restore-read-failure" { store.rejectRead = true }
                return "completed"
            }
            try require(value == "completed", "Operation result must be preserved")
        } catch let error as MacosTrustAuthorizationError { caught = error }
        if scenario == "operation-state-uncertain" {
            try require(caught == .operationStateUncertain && operationCalled && store.journal == nil
                && equalRules(store.currentRule, startingRule), "An uncertain CA result must remain distinct after rule restoration")
        } else if ["restore-write-failure", "restore-read-failure", "external-change"].contains(scenario) {
            try require(caught == .restorationFailed && store.journal != nil, "Unverified restoration must block fallback")
            if scenario == "external-change" { try require(store.writes.count == 1, "Do not overwrite external changes") }
        } else if ["modify-denied", "modify-partial-failure", "operation-failure", "backup-failure", "unsupported-policy"].contains(scenario) {
            try require(caught == .unavailable && store.journal == nil && equalRules(store.currentRule, startingRule), "Fallback requires verified original policy")
            try require(operationCalled == (scenario == "operation-failure"), "Denied changes must not run the CA operation")
        } else {
            try require(caught == nil && operationCalled && store.journal == nil && equalRules(store.currentRule, startingRule), "Automatic success requires completed operation and restoration")
            try require(store.events == (scenario == "already-root" ? ["operation"] : ["save", "write", "operation", "write", "clear"]), "Journal/write/operation/restore ordering must be exact")
        }
    }
}