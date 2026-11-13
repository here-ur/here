import XCTest
import Supabase
import AVFoundation
@testable import Here

final class VoiceProtocolTests: XCTestCase {
    func testSignedAppCanPersistSessionInKeychain() throws {
        let service = "com.hereur.here.test." + UUID().uuidString
        try SessionStorageCheck.verify(KeychainLocalStorage(service: service))
        let first = KeychainLocalStorage(service: service)
        let second = KeychainLocalStorage(service: service)
        let value = Data("test-session-not-a-token".utf8)
        defer { try? first.remove(key: "session") }
        try first.store(key: "session", value: value)
        XCTAssertEqual(try second.retrieve(key: "session"), value)
    }
    func testFinalTranscriptSavedOnlyOnceWithValidSource() {
        var ledger = VoiceTurnLedger()
        XCTAssertTrue(ledger.claimTranscript(id: "item_123", text: "금요일에는 기타 연습해"))
        XCTAssertFalse(ledger.claimTranscript(id: "item_123", text: "금요일에는 기타 연습해"))
        XCTAssertFalse(ledger.claimTranscript(id: "../../other-user", text: "hello"))
        XCTAssertFalse(ledger.claimTranscript(id: "item_456", text: "  \n"))
        XCTAssertFalse(ledger.claimTranscript(id: "item_789", text: String(repeating: "😀", count: 4001)))
    }
    func testOldToolResponseCannotSpeakOverNewUserTurn() {
        var ledger = VoiceTurnLedger()
        ledger.created("response_old")
        XCTAssertTrue(ledger.isCurrent("response_old"))
        ledger.userStarted()
        XCTAssertFalse(ledger.isCurrent("response_old"))
        ledger.created("response_new")
        XCTAssertTrue(ledger.isCurrent("response_new"))
        XCTAssertTrue(ledger.finish("response_new"))
        XCTAssertFalse(ledger.finish("response_new"))
    }
    func testToolBudgetAndDuplicateCalls() {
        var ledger = VoiceTurnLedger()
        XCTAssertTrue(ledger.claimCall("call_1"))
        XCTAssertFalse(ledger.claimCall("call_1"))
        XCTAssertTrue(ledger.allowSearch())
        XCTAssertTrue(ledger.allowSearch())
        XCTAssertFalse(ledger.allowSearch())
        ledger.userStarted()
        XCTAssertTrue(ledger.allowSearch())
        for _ in 0..<4 { ledger.nextRound() }
        XCTAssertFalse(ledger.allowSearch())
    }
    func testInitialAudioSetupDoesNotHangUpButRealInterruptionDoes() {
        XCTAssertFalse(VoiceAudio.shouldEnd(name: AVAudioSession.routeChangeNotification,
            reason: AVAudioSession.RouteChangeReason.categoryChange.rawValue, interruption: nil, engineRunning: true))
        XCTAssertFalse(VoiceAudio.shouldEnd(name: .AVAudioEngineConfigurationChange,
            reason: nil, interruption: nil, engineRunning: true))
        XCTAssertTrue(VoiceAudio.shouldEnd(name: AVAudioSession.routeChangeNotification,
            reason: AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue, interruption: nil, engineRunning: true))
        XCTAssertTrue(VoiceAudio.shouldEnd(name: AVAudioSession.interruptionNotification,
            reason: nil, interruption: AVAudioSession.InterruptionType.began.rawValue, engineRunning: true))
        XCTAssertFalse(VoiceAudio.shouldEnd(name: AVAudioSession.interruptionNotification,
            reason: nil, interruption: AVAudioSession.InterruptionType.ended.rawValue, engineRunning: true))
    }
    func testPCMEndiannessAndMalformedAudio() {
        XCTAssertEqual(VoicePCM.decode(Data([0, 0, 0, 128, 0, 64])), [0, -1, 0.5])
        XCTAssertNil(VoicePCM.decode(Data([1])))
        XCTAssertNil(VoicePCM.decode(Data()))
        XCTAssertNil(VoicePCM.decode(Data(count: 1_048_578)))
    }
    func testSearchLinksRejectUntrustedSchemesAndCredentials() {
        XCTAssertNil(VoiceSource(title: "bad", url: "javascript:alert(1)").safeURL)
        XCTAssertNil(VoiceSource(title: "bad", url: "https://secret@example.com").safeURL)
        XCTAssertNil(VoiceSource(title: "local", url: "https://127.0.0.1").safeURL)
        XCTAssertNotNil(VoiceSource(title: "Apple", url: "https://developer.apple.com/documentation").safeURL)
    }
}

@MainActor
final class VoiceLifecycleTests: XCTestCase {
    func testPermissionDeniedDoesNotMintSessionOrEnableMic() async {
        let voice = VoiceConversation(permission: { false })
        var requests = 0
        await voice.start(request: { _, _ in requests += 1; return Data() }, persona: [:], onText: { _, _ in })
        XCTAssertEqual(requests, 0)
        XCTAssertFalse(voice.active)
        XCTAssertTrue(voice.permissionDenied)
        XCTAssertFalse(voice.error.isEmpty)
    }
    func testCancelWhilePermissionPromptIsOpenPreventsLateConnection() async {
        var continuation: CheckedContinuation<Bool, Never>?
        let voice = VoiceConversation(permission: { await withCheckedContinuation { continuation = $0 } })
        var requests = 0
        let start = Task { await voice.start(request: { _, _ in requests += 1; return Data() }, persona: [:], onText: { _, _ in }) }
        while continuation == nil { await Task.yield() }
        voice.stop()
        continuation?.resume(returning: true)
        await start.value
        XCTAssertEqual(requests, 0)
        XCTAssertFalse(voice.active)
    }
    func testCancelWhileFetchingKeyIgnoresLateCredential() async {
        var continuation: CheckedContinuation<Data, Never>?
        let voice = VoiceConversation(permission: { true })
        let start = Task { await voice.start(request: { _, _ in await withCheckedContinuation { continuation = $0 } }, persona: [:], onText: { _, _ in }) }
        while continuation == nil { await Task.yield() }
        voice.stop()
        continuation?.resume(returning: Data(#"{"key":"test-never-connect","model":"test","memory":true,"webSearch":true}"#.utf8))
        await start.value
        XCTAssertFalse(voice.active)
        XCTAssertTrue(voice.error.isEmpty)
    }
    func testServerFailureReturnsToRetryableIdleState() async {
        let voice = VoiceConversation(permission: { true })
        await voice.start(request: { _, _ in throw APIError(error: "이용 한도에 도달했어요.") }, persona: [:], onText: { _, _ in })
        XCTAssertFalse(voice.active)
        XCTAssertEqual(voice.error, "이용 한도에 도달했어요.")
    }
    func testPreviewCannotObtainVoiceRequest() {
        let model = AppModel()
        model.startPreview()
        XCTAssertThrowsError(try model.voiceRequest())
    }
}

final class SpeechPlaybackEnvelopeTests: XCTestCase {
    func testQueuedSpeechWaitsForPlaybackClockAndSilenceClosesMouth() {
        var envelope = SpeechPlaybackEnvelope()
        envelope.append(Array(repeating: 0, count: 2400), startingAt: 0)
        envelope.append(Array(repeating: 0.15, count: 2400), startingAt: 2400)
        envelope.append(Array(repeating: 0, count: 4800), startingAt: 4800)
        XCTAssertEqual(envelope.sample(at: 0), 0)
        XCTAssertEqual(envelope.sample(at: 2399), 0)
        XCTAssertGreaterThan(envelope.sample(at: 2400), 0.5)
        for frame in stride(from: 4800, to: 9600, by: 480) { _ = envelope.sample(at: Int64(frame)) }
        XCTAssertEqual(envelope.level, 0)
    }
    func testBargeInDiscardsQueuedEnvelopeAndNewPlaybackStartsClean() {
        var envelope = SpeechPlaybackEnvelope()
        envelope.append(Array(repeating: 0.3, count: 24000), startingAt: 0)
        XCTAssertGreaterThan(envelope.sample(at: 0), 0)
        envelope.reset()
        XCTAssertEqual(envelope.sample(at: 0), 0)
        envelope.append(Array(repeating: 0, count: 480), startingAt: 0)
        XCTAssertEqual(envelope.sample(at: 0), 0)
    }
    func testInvalidSamplesAndLoudAudioStayWithinFaceRange() {
        var envelope = SpeechPlaybackEnvelope()
        envelope.append([.nan, .infinity, -.infinity], startingAt: 0)
        XCTAssertEqual(envelope.sample(at: 0), 0)
        envelope.append(Array(repeating: 100, count: 480), startingAt: 3)
        for _ in 0..<20 { XCTAssertTrue((0...1).contains(envelope.sample(at: 3))) }
        for _ in 0..<20 { _ = envelope.sample(at: 1000) }
        XCTAssertEqual(envelope.level, 0)
    }
}
