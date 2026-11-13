import Foundation

enum DaySky: String, Codable, CaseIterable, Identifiable {
    case sunny, cozy, cloudy, rain, thunder, wind
    var id: String { rawValue }
    var title: String { ["맑음", "포근", "흐림", "비", "천둥", "바람"][Self.allCases.firstIndex(of: self)!] }
    var symbol: String { ["sun.max.fill", "cloud.sun.fill", "cloud.fill", "cloud.rain.fill", "cloud.bolt.rain.fill", "wind"][Self.allCases.firstIndex(of: self)!] }
}

enum GardenTopic: String, Codable, CaseIterable, Identifiable {
    case work, people, rest, likes, thoughts
    var id: String { rawValue }
    var title: String { ["일·공부", "사람·관계", "쉼·몸", "좋아하는 것", "생각·하루"][Self.allCases.firstIndex(of: self)!] }
    var symbol: String { ["tree.fill", "camera.macro", "leaf.fill", "carrot.fill", "sparkles"][Self.allCases.firstIndex(of: self)!] }
    var words: [String] {
        switch self {
        case .work: return ["회사", "업무", "출근", "퇴근", "프로젝트", "공부", "시험", "면접", "취업", "학교"]
        case .people: return ["친구", "엄마", "아빠", "가족", "동료", "부모님", "애인", "연애", "남편", "아내"]
        case .rest: return ["휴식", "산책", "운동", "요가", "수영", "주말", "휴가", "낮잠"]
        case .likes: return ["게임", "영화", "음악", "노래", "커피", "맛집", "여행", "고양이", "강아지", "그림", "요리"]
        case .thoughts: return ["생각", "하루", "오늘", "어제", "내일", "요즘", "계획", "목표", "일기"]
        }
    }
}

struct StorySeed: Identifiable {
    let id: String
    let title: String
    let topic: GardenTopic
    let draft: String
    static let all: [Self] = [
        .init(id: "food", title: "요즘 맛있던 것", topic: .likes, draft: "요즘 먹은 것 중에 맛있었던 거 얘기해 줄게."),
        .init(id: "small", title: "오늘 해낸 작은 일", topic: .work, draft: "오늘 해낸 작은 일이 있어."),
        .init(id: "rest", title: "나만의 쉬는 법", topic: .rest, draft: "내가 쉬는 방법 얘기해 볼까?"),
        .init(id: "song", title: "요즘 듣는 노래", topic: .likes, draft: "요즘 자주 듣는 노래가 있어."),
        .init(id: "person", title: "생각나는 사람", topic: .people, draft: "요즘 문득 생각나는 사람이 있어."),
        .init(id: "day", title: "오늘 웃겼던 일", topic: .thoughts, draft: "오늘 있었던 웃긴 일 얘기해 줄게.")
    ]
    static func offered(on date: String) -> [Self] {
        let index = date.utf8.reduce(0) { ($0 * 31 + Int($1)) % all.count }
        return (0..<3).map { all[(index + $0) % all.count] }
    }
}

struct JournalDay: Codable, Identifiable, Equatable {
    let date: String
    var sent = 0
    var replies = 0
    var hours = Array(repeating: 0, count: 24)
    var topics: Set<GardenTopic> = []
    var sky: DaySky?
    var seed: String?
    var excludedFromGarden = false
    var id: String { date }
    mutating func record(role: String, text: String, crisis: Bool, hour: Int) {
        if role == "user" {
            sent += 1
            hours[min(23, max(0, hour))] += 1
            let sensitive = text.range(of: "자살|자해|죽고|죽을|죽어|살기 싫|사라지고|우울|공황|트라우마", options: .regularExpression) != nil
            excludedFromGarden = excludedFromGarden || crisis || sensitive
            if !excludedFromGarden {
                for topic in GardenTopic.allCases where topic.words.contains(where: { text.contains($0) }) { topics.insert(topic) }
            } else { topics = [] }
        } else if role == "assistant" { replies += 1 }
    }
    var plants: Set<GardenTopic> {
        guard sent > 0, !excludedFromGarden else { return [] }
        var result = topics
        if let picked = StorySeed.all.first(where: { $0.id == seed }) { result.insert(picked.topic) }
        return result
    }
}

enum JournalCalendar {
    static var calendar: Calendar { var c = Calendar(identifier: .gregorian); c.timeZone = .current; return c }
    static func key(_ date: Date) -> String {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", parts.year!, parts.month!, parts.day!)
    }
    static func date(_ key: String) -> Date? {
        let parts = key.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3, let date = calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])), Self.key(date) == key else { return nil }
        return date
    }
    static func days(in month: Date) -> [Date?] {
        guard let start = calendar.date(from: calendar.dateComponents([.year, .month], from: month)),
              let range = calendar.range(of: .day, in: .month, for: start) else { return [] }
        let padding = calendar.component(.weekday, from: start) - 1
        return Array(repeating: nil, count: padding) + range.map { calendar.date(byAdding: .day, value: $0 - 1, to: start) }
    }
}

/// Only daily counts, broad topic IDs and chosen skies. Never persists transcripts.
struct JournalStore {
    let directory: URL
    init(directory: URL? = nil) {
        self.directory = directory ?? FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Journal", isDirectory: true)
    }
    func load(account: UUID, now: Date = Date()) throws -> [JournalDay] {
        let url = file(account)
        guard FileManager.default.fileExists(atPath: url.path) else { return [] }
        let days = try JSONDecoder().decode([JournalDay].self, from: Data(contentsOf: url))
        return retained(days, now: now)
    }
    func save(_ days: [JournalDay], account: UUID, now: Date = Date()) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        var folder = directory
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        try folder.setResourceValues(values)
        try JSONEncoder().encode(retained(days, now: now)).write(to: file(account), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    private func file(_ account: UUID) -> URL { directory.appendingPathComponent(account.uuidString + ".json") }
    private func retained(_ days: [JournalDay], now: Date) -> [JournalDay] {
        let oldest = JournalCalendar.key(JournalCalendar.calendar.date(byAdding: .day, value: -364, to: now)!)
        let today = JournalCalendar.key(now)
        return days.filter { $0.date >= oldest && $0.date <= today && JournalCalendar.date($0.date) != nil && $0.sent >= 0 && $0.replies >= 0 && $0.hours.count == 24 && $0.hours.allSatisfy { $0 >= 0 } }.sorted { $0.date < $1.date }
    }
}

struct SavedMemory: Decodable, Identifiable {
    let id: UUID
    let summary: String
    let status: String
    let created_at: String
}
struct MemoriesResponse: Decodable { let available: Bool; let memories: [SavedMemory] }
struct MemberFriend: Decodable {
    let display_name: String?
    let relation: String
    let joined_at: String
}
struct ConversationQuota: Decodable {
    struct Count: Decodable { let limit: Int; let used: Int; var remaining: Int { max(0, limit - used) } }
    let chat: Count
    let realtime: Count
    let reset_at: Double
}
