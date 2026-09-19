import CryptoKit
import Foundation
import LocalAuthentication
import Security
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