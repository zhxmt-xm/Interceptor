import AVFoundation
import AppKit
import CoreMedia
import Darwin
import Foundation
import ScreenCaptureKit

private func fail(_ message: String) -> Never {
    FileHandle.standardError.write(Data((message + "\n").utf8))
    exit(EXIT_FAILURE)
}

@available(macOS 15.0, *)
private final class RecordingDelegate: NSObject, SCRecordingOutputDelegate {
    func recordingOutputDidStartRecording(_ recordingOutput: SCRecordingOutput) {
        FileHandle.standardOutput.write(Data("recording-started\n".utf8))
    }

    func recordingOutput(_ recordingOutput: SCRecordingOutput, didFailWithError error: Error) {
        fail("Native window recording failed: \(error.localizedDescription)")
    }

    func recordingOutputDidFinishRecording(_ recordingOutput: SCRecordingOutput) {
        FileHandle.standardOutput.write(Data("recording-finished\n".utf8))
        exit(EXIT_SUCCESS)
    }
}

@main
private struct GuideWindowRecorder {
    @MainActor
    static func main() async {
        guard #available(macOS 15.0, *) else {
            fail("Native tutorial video recording requires macOS 15 or later.")
        }
        guard CommandLine.arguments.count == 3,
              let windowID = UInt32(CommandLine.arguments[1]),
              CommandLine.arguments[2].hasPrefix("/") else {
            fail("Usage: guide-recorder <owned-window-id> <absolute-output.mp4>")
        }
        _ = NSApplication.shared
        do {
            FileHandle.standardOutput.write(Data("requesting-window-access\n".utf8))
            let content = try await SCShareableContent.excludingDesktopWindows(
                true, onScreenWindowsOnly: false
            )
            guard let window = content.windows.first(where: { $0.windowID == windowID }) else {
                fail("The workflow-owned App window is no longer available.")
            }
            FileHandle.standardOutput.write(Data("window-resolved\n".utf8))
            let filter = SCContentFilter(desktopIndependentWindow: window)
            let configuration = SCStreamConfiguration()
            configuration.width = 1600
            configuration.height = 900
            configuration.minimumFrameInterval = CMTime(value: 1, timescale: 20)
            configuration.showsCursor = true
            configuration.includeChildWindows = true
            configuration.capturesAudio = false
            let stream = SCStream(filter: filter, configuration: configuration, delegate: nil)
            let outputConfiguration = SCRecordingOutputConfiguration()
            outputConfiguration.outputURL = URL(fileURLWithPath: CommandLine.arguments[2])
            outputConfiguration.videoCodecType = .h264
            outputConfiguration.outputFileType = .mp4
            let delegate = RecordingDelegate()
            let output = SCRecordingOutput(configuration: outputConfiguration, delegate: delegate)
            try stream.addRecordingOutput(output)
            signal(SIGINT, SIG_IGN)
            let stop = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
            stop.setEventHandler {
                Task {
                    do { try await stream.stopCapture() }
                    catch { fail("Cannot finish tutorial recording: \(error.localizedDescription)") }
                }
            }
            stop.resume()
            try await stream.startCapture()
            FileHandle.standardOutput.write(Data("capture-started\n".utf8))
            for try await line in FileHandle.standardInput.bytes.lines {
                let fields = line.split(separator: " ")
                guard (fields.count == 3 && fields[0] == "window")
                    || (fields.count == 4 && fields[0] == "snapshot") else {
                    fail("Invalid native recording command.")
                }
                guard
                      let targetID = UInt32(fields[1]), let sequence = Int(fields[2]) else {
                    fail("Invalid native recording window command.")
                }
                let current = try await SCShareableContent.excludingDesktopWindows(
                    true, onScreenWindowsOnly: false
                )
                guard let target = current.windows.first(where: { $0.windowID == targetID }) else {
                    fail("The selected owned recording window disappeared.")
                }
                let targetFilter = SCContentFilter(desktopIndependentWindow: target)
                if fields[0] == "window" {
                    try await stream.updateContentFilter(targetFilter)
                    FileHandle.standardOutput.write(Data("window-ready:\(sequence)\n".utf8))
                } else {
                    guard let pathData = Data(base64Encoded: String(fields[3])),
                          let destination = String(data: pathData, encoding: .utf8),
                          destination.hasPrefix("/") else {
                        fail("Invalid native snapshot destination.")
                    }
                    let imageConfiguration = SCStreamConfiguration()
                    imageConfiguration.width = Int(targetFilter.contentRect.width * CGFloat(targetFilter.pointPixelScale))
                    imageConfiguration.height = Int(targetFilter.contentRect.height * CGFloat(targetFilter.pointPixelScale))
                    imageConfiguration.showsCursor = false
                    imageConfiguration.includeChildWindows = true
                    imageConfiguration.ignoreShadowsSingleWindow = true
                    imageConfiguration.capturesAudio = false
                    let image = try await SCScreenshotManager.captureImage(
                        contentFilter: targetFilter, configuration: imageConfiguration
                    )
                    guard let png = NSBitmapImageRep(cgImage: image).representation(
                        using: .png, properties: [:]
                    ) else {
                        fail("Cannot encode the owned native window image.")
                    }
                    try png.write(to: URL(fileURLWithPath: destination), options: .atomic)
                    FileHandle.standardOutput.write(Data("snapshot-ready:\(sequence)\n".utf8))
                }
                withExtendedLifetime((output, delegate, stop)) {}
            }
            try await stream.stopCapture()
        } catch {
            fail("Cannot start tutorial recording: \(error.localizedDescription)")
        }
    }
}
