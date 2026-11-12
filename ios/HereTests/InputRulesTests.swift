import XCTest
@testable import Here

final class InputRulesTests: XCTestCase {
    func testKoreanAndInternationalPhoneFormats() {
        XCTAssertEqual(InputRules.phone("010 1234 5678"), "+821012345678")
        XCTAssertEqual(InputRules.phone("+82 (10) 1234-5678"), "+821012345678")
        XCTAssertNil(InputRules.phone("010123"))
        XCTAssertNil(InputRules.phone("hello"))
    }
    func testInviteNormalization() {
        XCTAssertEqual(InputRules.invite("abcd-1234-efab-5678"), "ABCD1234EFAB5678")
        XCTAssertNil(InputRules.invite("ABCD1234"))
        XCTAssertNil(InputRules.invite("ZZZZ1234EFAB5678"))
    }
    func testNamesCannotInjectInstructions() {
        XCTAssertEqual(InputRules.name("  고양이  🐈 "), "고양이")
        XCTAssertLessThanOrEqual(InputRules.name(String(repeating: "가", count: 20)).count, 10)
    }
    func testContextStaysWithinServerBudgetAndKeepsLatestUserTurn() {
        let messages = (0..<80).map { ChatMessage(role: $0 % 2 == 0 ? "assistant" : "user", content: String(repeating: "가", count: 2000)) }
        let turns = InputRules.context(messages)
        XCTAssertLessThanOrEqual(turns.count, 60)
        XCTAssertLessThanOrEqual(turns.reduce(0) { $0 + $1.content.count }, 60_000)
        XCTAssertEqual(turns.last?.role, "user")
    }
    func testWebAccountProfileCompatibility() throws {
        let json = #"{"version":1,"profile":{"nickname":"테스터","companion":"후추","shape":"cloud","color":"mint","voice":"cedar","style":"chat"}}"#
        let envelope = try JSONDecoder().decode(ProfileEnvelope.self, from: Data(json.utf8))
        XCTAssertEqual(envelope.profile?.companion, "후추")
        XCTAssertEqual(envelope.profile?.color, "mint")
        let reset = try JSONDecoder().decode(ProfileEnvelope.self, from: Data(#"{"version":1,"profile":null}"#.utf8))
        XCTAssertNil(reset.profile)
    }
}
