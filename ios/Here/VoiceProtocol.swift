import Foundation

struct VoiceSession: Decodable {
    let key: String
    let model: String
    let memory: Bool
    let webSearch: Bool
}

struct VoiceSource: Decodable, Identifiable {
    let title: String
    let url: String
    var id: String { url }
    var safeURL: URL? {
        guard let value = URL(string: url), value.scheme == "https", value.user == nil,
              value.password == nil, let host = value.host, host.contains("."),
              !["localhost", "127.", "10.", "192.168.", "169.254."].contains(where: host.hasPrefix) else { return nil }
        return value
    }
}

/// Memory deduplication and stale response protection are scoped to one voice session.
struct VoiceTurnLedger {
    private(set) var turn = 0
    private var transcripts = Set<String>()
    private var responses: [String: Int] = [:]
    private var completed = Set<String>()
    private var calls = Set<String>()
    private(set) var rounds = 0
    private(set) var searches = 0
    mutating func userStarted() { turn += 1; rounds = 0; searches = 0 }
    mutating func created(_ id: String) { responses[id] = turn }
    func isCurrent(_ response: String) -> Bool { responses[response] == turn }
    mutating func finish(_ id: String) -> Bool { completed.insert(id).inserted }
    mutating func claimCall(_ id: String) -> Bool { Self.validID(id) && calls.insert(id).inserted }
    mutating func claimTranscript(id: String, text: String) -> Bool {
        Self.validID(id) && !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && text.utf16.count <= 8000 && transcripts.insert(id).inserted
    }
    mutating func nextRound() { rounds += 1 }
    mutating func allowSearch() -> Bool {
        guard searches < 2, rounds < 4 else { return false }
        searches += 1
        return true
    }
    static func validID(_ id: String) -> Bool { id.range(of: "^[A-Za-z0-9_-]{1,150}$", options: .regularExpression) != nil }
}

/// Realtime PCM is signed 16-bit little endian, mono, 24 kHz.
enum VoicePCM {
    static let sampleRate = 24_000.0
    static func decode(_ data: Data) -> [Float]? {
        guard !data.isEmpty, data.count % 2 == 0, data.count <= 1_048_576 else { return nil }
        let bytes = [UInt8](data)
        return stride(from: 0, to: bytes.count, by: 2).map {
            Float(Int16(bitPattern: UInt16(bytes[$0]) | UInt16(bytes[$0 + 1]) << 8)) / 32768
        }
    }
}

enum VoiceAccessError: Error { case revoked }
