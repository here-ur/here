import Foundation

struct CompanionProfile: Codable, Equatable {
    var nickname: String
    var companion: String
    var shape: String
    var color: String
    var voice: String
    var style: String
    var accessory: String?

    static let preview = CompanionProfile(nickname: "", companion: "몽글이", shape: "round", color: "mint", voice: "cedar", style: "chat")
}

struct ProfileEnvelope: Codable {
    var version: Int
    var profile: CompanionProfile?
}

struct ChatMessage: Identifiable, Equatable {
    let id = UUID()
    let role: String
    let content: String
}

struct ChatTurn: Encodable {
    let role: String
    let content: String
}

struct ChatRequest: Encodable {
    let messages: [ChatTurn]
    let name: String
}

struct ChatReply: Decodable {
    let reply: String
    let crisis: Bool
    let suggest: Bool
}

struct ConsentStatus: Decodable {
    let required: Bool
    let version: String?
}

struct ConsentRequest: Encodable {
    let version: String
    let privacy: Bool
    let sensitive: Bool
}

struct APIError: Decodable, LocalizedError {
    let error: String
    var errorDescription: String? { error }
}

enum InputRules {
    static func phone(_ value: String) -> String? {
        let compact = value.replacingOccurrences(of: "[\\s()-]", with: "", options: .regularExpression)
        let result = compact.range(of: "^010[0-9]{8}$", options: .regularExpression) != nil
            ? "+82" + compact.dropFirst() : compact
        return result.range(of: "^\\+[1-9][0-9]{7,14}$", options: .regularExpression) != nil ? result : nil
    }
    static func invite(_ value: String) -> String? {
        let code = value.replacingOccurrences(of: "[\\s-]", with: "", options: .regularExpression).uppercased()
        return code.range(of: "^[0-9A-F]{16}$", options: .regularExpression) != nil ? code : nil
    }
    static func name(_ value: String) -> String {
        String(value.replacingOccurrences(of: "[^가-힣a-zA-Z0-9 ]", with: "", options: .regularExpression)
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespaces).prefix(10))
    }

    // Keep full turns within the server's 60-message / 60,000-character budget.
    static func context(_ messages: [ChatMessage]) -> [ChatTurn] {
        var characters = 0
        var turns: [ChatTurn] = []
        for message in messages.suffix(59).reversed() {
            guard characters + message.content.count <= 55_000 else { break }
            characters += message.content.count
            turns.append(ChatTurn(role: message.role, content: message.content))
        }
        return turns.reversed()
    }
}
