import Foundation
import Supabase

/// Validate secure storage before sending an OTP. An unsigned simulator build must not
/// appear to authenticate successfully while the SDK silently fails to persist its session.
enum SessionStorageCheck {
    static func verify(_ storage: any AuthLocalStorage) throws {
        let key = "here-storage-probe-" + UUID().uuidString
        let value = Data(UUID().uuidString.utf8)
        defer { try? storage.remove(key: key) }
        try storage.store(key: key, value: value)
        guard try storage.retrieve(key: key) == value else {
            throw APIError(error: "로그인 정보를 안전하게 저장할 수 없어요. 앱 빌드 설정을 확인해 주세요.")
        }
    }
}
