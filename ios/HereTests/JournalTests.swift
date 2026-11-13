import XCTest
@testable import Here

final class JournalTests: XCTestCase {
    func testRecordsOnlyCountsAndBroadTopicsNotConversationText() throws {
        var day = JournalDay(date: "2026-11-13")
        let original = "회사에서 프로젝트 준비하고 음악을 들었어. 원문저장금지_고유표식"
        day.record(role: "user", text: original, crisis: false, hour: 10)
        day.record(role: "assistant", text: "좋아", crisis: false, hour: 10)
        XCTAssertEqual(day.sent, 1)
        XCTAssertEqual(day.replies, 1)
        XCTAssertEqual(day.hours[10], 1)
        XCTAssertEqual(day.plants, [.work, .likes])
        let json = String(decoding: try JSONEncoder().encode(day), as: UTF8.self)
        XCTAssertFalse(json.contains("원문저장금지"))
        XCTAssertFalse(json.contains("회사"))
    }
    func testSeedOnlyGrowsAfterConversationAndCrisisIsExcluded() {
        var day = JournalDay(date: "2026-11-13")
        day.seed = "food"
        XCTAssertTrue(day.plants.isEmpty)
        day.record(role: "user", text: "안녕", crisis: false, hour: 0)
        XCTAssertEqual(day.plants, [.likes])
        day.record(role: "user", text: "오늘 회사", crisis: true, hour: 1)
        XCTAssertTrue(day.plants.isEmpty)
        day.record(role: "user", text: "음악", crisis: false, hour: 2)
        XCTAssertTrue(day.plants.isEmpty)
    }
    func testAccountIsolationAndReloadWithoutRawText() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = JournalStore(directory: folder)
        let first = UUID(), second = UUID(), now = Date()
        var day = JournalDay(date: JournalCalendar.key(now))
        day.sent = 3; day.sky = .cozy; day.seed = "food"
        try store.save([day], account: first, now: now)
        XCTAssertEqual(try store.load(account: first, now: now), [day])
        XCTAssertTrue(try store.load(account: second, now: now).isEmpty)
        try store.save([], account: second, now: now)
        XCTAssertEqual(try store.load(account: first, now: now), [day])
    }
    func testRetentionRejectsFutureMalformedAndExpiredDays() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let store = JournalStore(directory: folder), account = UUID()
        let now = JournalCalendar.date("2026-11-13")!
        let old = JournalDay(date: "2025-01-01")
        let future = JournalDay(date: "2026-11-14")
        let malformed = JournalDay(date: "2026-02-30")
        let today = JournalDay(date: "2026-11-13")
        try store.save([old, future, malformed, today], account: account, now: now)
        XCTAssertEqual(try store.load(account: account, now: now), [today])
    }
    func testLeapYearCalendarAndInvalidDates() {
        let month = JournalCalendar.date("2024-02-01")!
        XCTAssertEqual(JournalCalendar.days(in: month).compactMap { $0 }.count, 29)
        XCTAssertNil(JournalCalendar.date("2025-02-29"))
        XCTAssertNil(JournalCalendar.date("../elsewhere"))
        XCTAssertEqual(StorySeed.offered(on: "2026-11-13").map(\.id), StorySeed.offered(on: "2026-11-13").map(\.id))
        XCTAssertEqual(Set(StorySeed.offered(on: "2026-11-13").map(\.id)).count, 3)
    }
}

@MainActor
final class FeaturePreviewTests: XCTestCase {
    func testPreviewCannotReadPrivateDataOrCreateInvites() async {
        let model = AppModel(); model.startPreview()
        do { _ = try await model.loadMemories(); XCTFail("Preview fetched private memories") } catch {}
        do { _ = try await model.loadFriends(); XCTFail("Preview fetched friends") } catch {}
        do { _ = try await model.createFriendInvite(); XCTFail("Preview created invite") } catch {}
        model.recordConversation(role: "user", text: "회사 이야기")
        model.setSky(.sunny, date: JournalCalendar.key(Date()))
        model.chooseSeed(StorySeed.all[0])
        XCTAssertTrue(model.journal.isEmpty)
    }
}
