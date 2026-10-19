import AppKit
import Darwin
import Foundation
import ScreenCaptureKit

private func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(EXIT_FAILURE)
}

@main
private struct WindowScreenshot {
    @MainActor
    static func main() async {
        guard #available(macOS 14.0, *) else {
            fail("Native step screenshots require macOS 14 or later.")
        }
        guard CommandLine.arguments.count == 4,
              let processID = Int32(CommandLine.arguments[1]),
              let windowID = UInt32(CommandLine.arguments[2]),
              CommandLine.arguments[3].hasPrefix("/") else {
            fail("Usage: window-screenshot <owner-pid> <window-id> <absolute-output.png>")
        }
        _ = NSApplication.shared
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(
                true, onScreenWindowsOnly: false
            )
            guard let window = content.windows.first(where: {
                $0.windowID == windowID && $0.owningApplication?.processID == processID
            }) else {
                fail("The workflow-owned window is unavailable.")
            }
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let configuration = SCStreamConfiguration()
            configuration.width = Int(filter.contentRect.width * CGFloat(filter.pointPixelScale))
            configuration.height = Int(filter.contentRect.height * CGFloat(filter.pointPixelScale))
            configuration.showsCursor = false
            configuration.ignoreShadowsSingleWindow = true
            configuration.capturesAudio = false
            let image = try await SCScreenshotManager.captureImage(
                contentFilter: filter, configuration: configuration
            )
            guard let png = NSBitmapImageRep(cgImage: image).representation(
                using: .png, properties: [:]
            ) else {
                fail("Cannot encode the workflow-owned window.")
            }
            try png.write(to: URL(fileURLWithPath: CommandLine.arguments[3]), options: .atomic)
        } catch {
            fail("Cannot capture the workflow step: \(error.localizedDescription)")
        }
    }
}
