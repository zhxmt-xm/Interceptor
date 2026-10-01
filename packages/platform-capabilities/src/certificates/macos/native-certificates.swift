import AppKit
import CryptoKit
import Foundation
import LocalAuthentication
import Security
import SecurityInterface
import os

struct MacosHelperCertificate {
    let certificate: SecCertificate
    let data: Data
    let sha256: String

    static func decode(_ value: Any?) throws -> Self {
        guard let parameters = value as? [String: Any],
              Set(parameters.keys) == Set(["certificate", "sha256"]),
              let encoded = parameters["certificate"] as? String, encoded.utf8.count <= 87_384,
              let data = Data(base64Encoded: encoded), !data.isEmpty, data.count <= 65_536,
              data.base64EncodedString() == encoded,
              let sha256 = parameters["sha256"] as? String,
              SHA256.hash(data: data).map({ String(format: "%02X", $0) }).joined() == sha256,
              let certificate = SecCertificateCreateWithData(nil, data as CFData),
              SecCertificateCopySubjectSummary(certificate) as String? == "Interceptor CA",
              let subject = SecCertificateCopyNormalizedSubjectSequence(certificate) as Data?,
              let issuer = SecCertificateCopyNormalizedIssuerSequence(certificate) as Data?, subject == issuer else {
            throw MacosHelperServiceError.invalidRequest
        }
        return Self(certificate: certificate, data: data, sha256: sha256)
    }
}

enum MacosSystemCertificateStore {
    private static let logger = Logger(subsystem: "com.zhxmt.interceptor.platform-capabilities", category: "certificates")

    static func viewCertificate(_ requested: MacosHelperCertificate) throws {
        guard getuid() != 0, geteuid() != 0 else { throw MacosHelperServiceError.invalidRequest }
        let application = NSApplication.shared
        application.setActivationPolicy(.accessory)
        application.finishLaunching()
        guard let panel = SFCertificatePanel.shared() else {
            throw MacosHelperServiceError.operationFailed
        }
        panel.setShowsHelp(false)
        panel.setAlternateButtonTitle(nil)
          var certificateTrust: SecTrust?
          guard SecTrustCreateWithCertificates(requested.certificate, SecPolicyCreateBasicX509(), &certificateTrust) == errSecSuccess,
              let certificateTrust else { throw MacosHelperServiceError.invalidRequest }
        let reply = try JSONSerialization.data(withJSONObject: ["sha256": requested.sha256, "opened": true]) + Data([0x0A])
        var announced = false
        var outputError: Error?
        let observer = NotificationCenter.default.addObserver(forName: NSWindow.didBecomeKeyNotification, object: nil, queue: .main) { notification in
            guard let window = notification.object as? NSWindow,
                  let certificateView = panel.certificateView(),
                  window === certificateView.window, !announced else { return }
            guard let displayedCertificate = certificateView.certificate(),
                (SecCertificateCopyData(displayedCertificate.takeUnretainedValue()) as Data) == requested.data else {
                outputError = MacosHelperServiceError.verificationFailed
                application.abortModal()
                return
            }
            certificateView.setEditableTrust(false)
            certificateView.setDisplayTrust(false)
            certificateView.setDisplayDetails(true)
            certificateView.setDetailsDisclosed(true)
            window.title = "Interceptor CA"
            window.setAccessibilityIdentifier("com.zhxmt.interceptor.certificate.\(requested.sha256)")
            announced = true
            do { try FileHandle.standardOutput.write(contentsOf: reply) }
            catch { outputError = error; application.abortModal() }
        }
        let parentExit = DispatchSource.makeProcessSource(identifier: getppid(), eventMask: .exit, queue: .main)
        parentExit.setEventHandler { application.abortModal() }
        parentExit.resume()
        defer {
            parentExit.cancel()
            NotificationCenter.default.removeObserver(observer)
            panel.orderOut(nil)
        }
        application.activate(ignoringOtherApps: true)
        panel.runModal(for: certificateTrust, showGroup: false)
        if let outputError { throw outputError }
        guard announced else { throw MacosHelperServiceError.verificationFailed }
    }

    static func importCertificate(_ requested: MacosHelperCertificate) throws -> [String: Any] {
        guard geteuid() == 0 else { throw MacosHelperServiceError.authorizationRequired }
        let keychain = try openSystemKeychain()
        if try findCertificate(requested, keychain: keychain) == nil {
            let query: [String: Any] = [
                kSecClass as String: kSecClassCertificate,
                kSecValueRef as String: requested.certificate,
                kSecUseKeychain as String: keychain,
                kSecUseAuthenticationContext as String: noninteractiveContext(),
            ]
            let result = SecItemAdd(query as CFDictionary, nil)
            guard result == errSecSuccess || result == errSecDuplicateItem else {
                logger.error("certificate import failed: status=\(result, privacy: .public)")
                throw MacosHelperServiceError.operationFailed
            }
        }
        guard try findCertificate(requested, keychain: keychain) != nil else {
            throw MacosHelperServiceError.verificationFailed
        }
        return ["sha256": requested.sha256, "present": true]
    }

    static func trustCertificate(_ requested: MacosHelperCertificate) throws -> [String: Any] {
        let keychain = try openSystemKeychain()
        guard let certificate = try findCertificate(requested, keychain: keychain) else {
            throw MacosHelperServiceError.verificationFailed
        }
        return try MacosHelperInstallation.withForegroundAuthorization {
            try writeTrust(certificate, sha256: requested.sha256)
        }
    }

    private static func writeTrust(_ certificate: SecCertificate, sha256: String) throws -> [String: Any] {
        try requireTrustSuccess(SecTrustSettingsSetTrustSettings(certificate, .admin, nil))
        var settings: CFArray?
        guard SecTrustSettingsCopyTrustSettings(certificate, .admin, &settings) == errSecSuccess,
              let settings, CFArrayGetCount(settings) == 0 else {
            throw MacosHelperServiceError.certificateStateUncertain
        }
        return ["sha256": sha256, "trusted": true]
    }

    static func untrustCertificate(_ requested: MacosHelperCertificate) throws -> [String: Any] {
        if try hasNoTrust(requested.certificate) { return ["sha256": requested.sha256, "trusted": false] }
        return try MacosHelperInstallation.withForegroundAuthorization { try removeTrust(requested) }
    }

    private static func hasNoTrust(_ certificate: SecCertificate) throws -> Bool {
        var settings: CFArray?
        let existing = SecTrustSettingsCopyTrustSettings(certificate, .admin, &settings)
        if existing == errSecItemNotFound || existing == errSecNoTrustSettings { return true }
        guard existing == errSecSuccess else { throw MacosHelperServiceError.operationFailed }
        return false
    }

    private static func removeTrust(_ requested: MacosHelperCertificate) throws -> [String: Any] {
        try requireTrustSuccess(SecTrustSettingsRemoveTrustSettings(requested.certificate, .admin))
        guard (try? hasNoTrust(requested.certificate)) == true else { throw MacosHelperServiceError.certificateStateUncertain }
        return ["sha256": requested.sha256, "trusted": false]
    }

    private static func requireTrustSuccess(_ result: OSStatus) throws {
        guard result != errAuthorizationCanceled && result != errSecUserCanceled else {
            throw MacosHelperServiceError.authorizationCancelled
        }
        if result == errAuthorizationDenied || result == errAuthorizationInteractionNotAllowed {
            throw MacosHelperServiceError.authorizationRequired
        }
        guard result == errSecSuccess else {
            logger.error("certificate trust operation failed: status=\(result, privacy: .public)")
            throw MacosHelperServiceError.certificateStateUncertain
        }
    }

    static func removeCertificate(_ requested: MacosHelperCertificate) throws -> [String: Any] {
        guard geteuid() == 0 else { throw MacosHelperServiceError.authorizationRequired }
        let keychain = try openSystemKeychain()
        if let certificate = try findCertificate(requested, keychain: keychain) {
            let query: [String: Any] = [
                kSecClass as String: kSecClassCertificate,
                kSecMatchSearchList as String: [keychain],
                kSecMatchItemList as String: [certificate],
                kSecUseAuthenticationContext as String: noninteractiveContext(),
            ]
            let result = SecItemDelete(query as CFDictionary)
            guard result == errSecSuccess || result == errSecItemNotFound else {
                logger.error("certificate removal failed: status=\(result, privacy: .public)")
                throw MacosHelperServiceError.operationFailed
            }
        }
        guard try findCertificate(requested, keychain: keychain) == nil else {
            throw MacosHelperServiceError.verificationFailed
        }
        return ["sha256": requested.sha256, "present": false]
    }

    private static func openSystemKeychain() throws -> SecKeychain {
        var keychain: SecKeychain?
        guard SecKeychainOpen("/Library/Keychains/System.keychain", &keychain) == errSecSuccess,
              let keychain else { throw MacosHelperServiceError.operationFailed }
        return keychain
    }

    private static func noninteractiveContext() -> LAContext {
        let context = LAContext()
        context.interactionNotAllowed = true
        return context
    }

    private static func findCertificate(_ requested: MacosHelperCertificate, keychain: SecKeychain) throws -> SecCertificate? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassCertificate,
            kSecMatchSearchList as String: [keychain],
            kSecMatchLimit as String: kSecMatchLimitAll,
            kSecReturnRef as String: true,
            kSecUseAuthenticationContext as String: noninteractiveContext(),
        ]
        var result: CFTypeRef?
        let code = SecItemCopyMatching(query as CFDictionary, &result)
        if code == errSecItemNotFound { return nil }
        guard code == errSecSuccess, let certificates = result as? [SecCertificate] else {
            throw MacosHelperServiceError.operationFailed
        }
        return certificates.first { (SecCertificateCopyData($0) as Data) == requested.data }
    }
}