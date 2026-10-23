import AppKit
import CoreGraphics
import Foundation

func require(_ condition: Bool, _ message: String) throws {
    if !condition {
        throw NSError(domain: "interceptor.workflow.typing", code: 1,
                      userInfo: [NSLocalizedDescriptionKey: message])
    }
}

do {
    try require(CommandLine.arguments.count == 3, "Expected the owned App PID and text.")
    guard let pid = pid_t(CommandLine.arguments[1]), pid > 0 else {
        throw NSError(domain: "interceptor.workflow.typing", code: 2,
                      userInfo: [NSLocalizedDescriptionKey: "Invalid native typing owner."])
    }
    try require(CGPreflightPostEventAccess(), "Accessibility permission is required for native keyboard events.")
    for character in CommandLine.arguments[2] {
        try require(NSWorkspace.shared.frontmostApplication?.processIdentifier == pid,
                    "The owned file dialog lost foreground focus; typing stopped.")
        let units = Array(String(character).utf16)
        for down in [true, false] {
            guard let event = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: down) else {
                throw NSError(domain: "interceptor.workflow.typing", code: 3,
                              userInfo: [NSLocalizedDescriptionKey: "Cannot create a native keyboard event."])
            }
            event.flags = []
            units.withUnsafeBufferPointer { buffer in
                event.keyboardSetUnicodeString(stringLength: buffer.count, unicodeString: buffer.baseAddress!)
            }
            event.post(tap: .cghidEventTap)
        }
        Thread.sleep(forTimeInterval: 0.02)
    }
} catch {
    FileHandle.standardError.write(Data("\(error.localizedDescription)\n".utf8))
    exit(1)
}
