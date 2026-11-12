import Foundation
import Combine
import OSLog

@MainActor
final class VoiceConversation: ObservableObject {
    enum Phase { case idle, preparing, listening, thinking, speaking }
    @Published private(set) var phase: Phase = .idle
    @Published private(set) var muted = false
    @Published private(set) var level: Float = 0
    @Published private(set) var transcript = ""
    @Published private(set) var sources: [VoiceSource] = []
    @Published var error = ""
    @Published var warning = ""
    @Published var permissionDenied = false
    @Published var helpNotice = ""
    var active: Bool { phase != .idle }
    var status: String {
        if muted && active { return "마이크 꺼짐" }
        switch phase {
        case .idle: return ""
        case .preparing: return "음성 준비 중"
        case .listening: return "듣고 있어"
        case .thinking: return "생각 중"
        case .speaking: return "이야기하는 중"
        }
    }
    private let audio = VoiceAudio()
    private let permission: () async -> Bool
    init(permission: @escaping () async -> Bool = { await VoiceAudio.permission() }) {
        self.permission = permission
    }
    private var socket: URLSessionWebSocketTask?
    private var network: URLSession?
    private var outgoing: AsyncStream<String>.Continuation?
    private var tasks: [Task<Void, Never>] = []
    private var epoch = UUID()
    private var ledger = VoiceTurnLedger()
    private var sessionID = UUID().uuidString
    private var ready = false
    private var responseActive = false
    private var currentAudioItem: String?
    private var currentContentIndex = 0
    private var ignoredResponses = Set<String>()
    private var audioResponse: String?
    private var config: VoiceSession?
    private var request: ((String, [String: Any]) async throws -> Data)?
    private var onText: ((String, String) -> Void)?

    /// No permanent API key is accepted here. Session credentials are minted by the member-gated server.
    func start(request: @escaping (String, [String: Any]) async throws -> Data,
               persona: [String: String], onText: @escaping (String, String) -> Void) async {
        guard !active else { return }
        stop()
        sessionID = UUID().uuidString
        error = ""; warning = ""; permissionDenied = false; transcript = ""; sources = []
        phase = .preparing
        self.request = request; self.onText = onText
        let attempt = epoch
        guard await permission() else {
            guard epoch == attempt else { return }
            permissionDenied = true
            fail("마이크 권한이 꺼져 있어요. 설정에서 Here Dev의 마이크를 허용해 주세요.")
            return
        }
        guard epoch == attempt else { return }
        do {
            let data = try await request("realtime", persona)
            guard epoch == attempt else { return }
            let config = try JSONDecoder().decode(VoiceSession.self, from: data)
            guard !config.key.isEmpty, config.model.range(of: "^[A-Za-z0-9._-]+$", options: .regularExpression) != nil else {
                throw APIError(error: "음성 설정을 받지 못했어요.")
            }
            self.config = config
            var components = URLComponents(string: "wss://api.openai.com/v1/realtime")!
            components.queryItems = [URLQueryItem(name: "model", value: config.model)]
            var connection = URLRequest(url: components.url!)
            connection.setValue("Bearer \(config.key)", forHTTPHeaderField: "Authorization")
            let network = URLSession(configuration: .ephemeral)
            self.network = network
            let socket = network.webSocketTask(with: connection)
            socket.maximumMessageSize = 2_000_000
            self.socket = socket
            let stream = AsyncStream<String>(bufferingPolicy: .bufferingOldest(64)) { self.outgoing = $0 }
            socket.resume()
            tasks.append(Task { [weak self] in
                do {
                    for await value in stream {
                        guard !Task.isCancelled else { return }
                        try await socket.send(.string(value))
                    }
                } catch { if self?.epoch == attempt { self?.fail("음성 전송이 끊겼어요. 다시 시도해 주세요.") } }
            })
            tasks.append(Task { [weak self] in
                do {
                    while !Task.isCancelled {
                        let message = try await socket.receive()
                        guard let self, self.epoch == attempt else { return }
                        let data: Data
                        switch message {
                        case .data(let bytes): data = bytes
                        case .string(let string): data = Data(string.utf8)
                        @unknown default: continue
                        }
                        guard let event = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
                        try self.receive(event)
                    }
                } catch { if self?.epoch == attempt { self?.fail("음성 연결이 끊겼어요. 마이크를 눌러 다시 시작해 주세요.") } }
            })
            tasks.append(Task { [weak self] in
                try? await Task.sleep(for: .seconds(25))
                guard !Task.isCancelled, let self, self.epoch == attempt, !self.ready else { return }
                self.fail("음성 준비가 오래 걸리고 있어요. 연결을 확인하고 다시 시도해 주세요.")
            })
            // Bound idle sessions, key lifetime is not a session lifetime.
            tasks.append(Task { [weak self] in
                try? await Task.sleep(for: .seconds(30 * 60))
                guard !Task.isCancelled, self?.epoch == attempt else { return }
                self?.stop(); self?.warning = "음성 대화를 종료했어요. 마이크를 누르면 다시 이어갈 수 있어요."
            })
        } catch {
            guard epoch == attempt else { return }
            fail((error as? APIError)?.error ?? "음성을 시작하지 못했어요. 다시 시도해 주세요.")
        }
    }

    func stop() {
        epoch = UUID()
        ready = false
        audio.stop()
        outgoing?.finish(); outgoing = nil
        tasks.forEach { $0.cancel() }; tasks = []
        socket?.cancel(with: .normalClosure, reason: nil); socket = nil
        network?.invalidateAndCancel(); network = nil
        config = nil; request = nil; onText = nil
        ledger = VoiceTurnLedger()
        ignoredResponses = []; audioResponse = nil; currentAudioItem = nil; responseActive = false
        phase = .idle; muted = false; level = 0
    }

    func mute() {
        guard ready else { return }
        muted.toggle()
        if muted { send(["type": "input_audio_buffer.clear"]) }
    }

    private func diagnostic(_ code: String) {
        #if DEBUG
        // Event names only, never audio, transcripts, credentials or user identifiers.
        Logger(subsystem: "com.hereur.here.dev", category: "voice").info("\(code, privacy: .public)")
        #endif
    }

    private func fail(_ message: String) { stop(); error = message }
    private func send(_ event: [String: Any]) {
        guard let outgoing, let data = try? JSONSerialization.data(withJSONObject: event),
              let text = String(data: data, encoding: .utf8) else { return }
        if case .dropped = outgoing.yield(text) { fail("네트워크가 음성 속도를 따라가지 못했어요. 다시 연결해 주세요.") }
    }

    private func receive(_ event: [String: Any]) throws {
        guard let type = event["type"] as? String else { return }
        switch type {
        case "session.created":
            diagnostic("session_created")
            send(["type": "session.update", "session": ["type": "realtime", "audio": [
                "input": ["format": ["type": "audio/pcm", "rate": 24000],
                          "turn_detection": ["type": "semantic_vad", "eagerness": "low", "create_response": true, "interrupt_response": true]],
                "output": ["format": ["type": "audio/pcm", "rate": 24000]]]]])
        case "session.updated":
            guard !ready else { return }
            let attempt = epoch
            audio.onDrained = { [weak self] in
                guard let self, self.epoch == attempt else { return }
                self.phase = self.responseActive ? .thinking : .listening
            }
            audio.onLevel = { [weak self] value in if self?.epoch == attempt { self?.level = value } }
            try audio.start(onInput: { [weak self] data in
                guard let self, self.epoch == attempt, self.ready, !self.muted else { return }
                self.send(["type": "input_audio_buffer.append", "audio": data.base64EncodedString()])
            }, onInterrupted: { [weak self] in
                guard let self, self.epoch == attempt else { return }
                self.stop(); self.warning = "오디오 사용이 중단됐어요. 마이크를 눌러 다시 시작해 주세요."
            })
            ready = true; phase = .listening
            diagnostic("microphone_ready")
        case "input_audio_buffer.speech_started":
            ledger.userStarted(); sources = []; transcript = ""
            if let item = currentAudioItem {
                if let response = audioResponse { ignoredResponses.insert(response) }
                let heard = audio.clearPlayback()
                send(["type": "conversation.item.truncate", "item_id": item,
                      "content_index": currentContentIndex, "audio_end_ms": heard])
                currentAudioItem = nil
            }
            phase = .listening
        case "input_audio_buffer.speech_stopped": phase = .thinking
        case "conversation.item.input_audio_transcription.completed":
            guard let text = event["transcript"] as? String, let id = event["item_id"] as? String,
                  ledger.claimTranscript(id: id, text: text) else { return }
            onText?("user", text)
            remember(text, id: id)
        case "conversation.item.input_audio_transcription.failed":
            warning = "일부 음성을 알아듣지 못해 기억에 남기지 못했어요."
        case "response.created":
            if let response = event["response"] as? [String: Any], let id = response["id"] as? String {
                ledger.created(id); responseActive = true; transcript = ""
            }
        case "response.output_audio.delta":
            guard let response = event["response_id"] as? String, !ignoredResponses.contains(response), ledger.isCurrent(response),
                  let delta = event["delta"] as? String, let bytes = Data(base64Encoded: delta),
                  let item = event["item_id"] as? String else { return }
            if currentAudioItem != item { audio.clearPlayback(); currentAudioItem = item }
            audioResponse = response; currentContentIndex = event["content_index"] as? Int ?? 0
            try audio.enqueue(bytes); phase = .speaking
        case "response.output_audio_transcript.delta":
            guard let response = event["response_id"] as? String, ledger.isCurrent(response), !ignoredResponses.contains(response),
                  let delta = event["delta"] as? String else { return }
            transcript = String((transcript + delta).suffix(8000))
        case "response.output_audio_transcript.done":
            guard let response = event["response_id"] as? String, ledger.isCurrent(response), !ignoredResponses.contains(response),
                  let text = event["transcript"] as? String else { return }
            transcript = text
            onText?("assistant", text)
        case "response.done":
            guard let response = event["response"] as? [String: Any], let id = response["id"] as? String,
                  ledger.finish(id), ledger.isCurrent(id) else { return }
            responseActive = false
            let status = response["status"] as? String
            if status == "failed" { fail("답변을 만들지 못했어요. 다시 연결해 주세요."); return }
            let calls = (response["output"] as? [[String: Any]] ?? []).filter { ($0["type"] as? String) == "function_call" }
            if status == "completed", !calls.isEmpty { runTools(calls) }
            else if audio.pendingBuffers == 0 { phase = .listening }
        case "error":
            if let detail = event["error"] as? [String: Any], let code = detail["code"] as? String,
               code.range(of: "^[A-Za-z0-9_]{1,80}$", options: .regularExpression) != nil { diagnostic("server_error_" + code) }
            fail("음성 요청을 처리하지 못했어요. 다시 시도해 주세요.")
        default: break
        }
    }

    private func remember(_ text: String, id: String) {
        guard config?.memory == true, let request else { return }
        let sourceID = sessionID + ":" + id
        let savingSession = sessionID
        let attempt = epoch
        // Not part of socket task cancellation: a finalized utterance can finish saving after hangup.
        // request itself pins the original account, so it cannot save into a subsequent login.
        Task { [weak self] in
            do {
                let data = try await request("voice-memory", ["action": "remember", "text": text, "sourceId": sourceID])
                let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                guard result?["accepted"] as? Bool == true else { throw APIError(error: "기억 저장 요청 실패") }
            } catch VoiceAccessError.revoked {
                if self?.epoch == attempt { self?.fail("회원·이용 동의 상태를 다시 확인해 주세요.") }
            } catch {
                // A later call/account must never receive a prior session's warning.
                if self?.sessionID == savingSession { self?.warning = "이번 발언의 기억 저장을 요청하지 못했어요." }
            }
        }
    }

    private func runTools(_ calls: [[String: Any]]) {
        guard let request else { return }
        let attempt = epoch, startedTurn = ledger.turn
        phase = .thinking
        tasks.append(Task { [weak self] in
            guard let self else { return }
            for call in calls.prefix(8) {
                guard self.epoch == attempt, let id = call["call_id"] as? String, self.ledger.claimCall(id) else { continue }
                let name = call["name"] as? String ?? ""
                let args = ((call["arguments"] as? String)?.data(using: .utf8)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] }
                var output: [String: Any] = ["available": false]
                do {
                    if name == "recall_memories", self.config?.memory == true, self.ledger.rounds < 4,
                       let query = args?["query"] as? String, !query.isEmpty, query.utf16.count <= 1000 {
                        let data = try await request("voice-memory", ["action": "recall", "text": query])
                        let result = try JSONSerialization.jsonObject(with: data) as? [String: Any]
                        let context = result?["context"] as? String ?? ""
                        output = ["context": String(context.prefix(8000)), "available": !context.isEmpty]
                    } else if name == "search_web", self.config?.webSearch == true, self.ledger.allowSearch(),
                              let query = args?["query"] as? String, !query.isEmpty, query.utf16.count <= 300 {
                        let data = try await request("web-search", ["query": query])
                        output = try JSONSerialization.jsonObject(with: data) as? [String: Any] ?? output
                        struct Result: Decodable { let sources: [VoiceSource] }
                        if self.epoch == attempt, self.ledger.turn == startedTurn,
                           let result = try? JSONDecoder().decode(Result.self, from: data) {
                            self.sources = Array(result.sources.filter { $0.safeURL != nil }.prefix(5))
                        }
                    } else if name == "show_crisis_help" || name == "show_get_help" {
                        self.helpNotice = name == "show_crisis_help"
                            ? "지금 위험하다면 가까운 사람에게 바로 연락하고, 지역 응급 서비스의 도움을 받아 주세요."
                            : "전문가의 도움이 필요하다면 상담을 알아볼 수 있어요. Here의 상담 연결은 아직 준비 중이에요."
                        output = ["shown": true]
                    }
                } catch VoiceAccessError.revoked {
                    if self.epoch == attempt { self.fail("회원·이용 동의 상태를 다시 확인해 주세요.") }
                    return
                } catch { output = ["available": false, "text": "조회하지 못했어. 확인했다고 말하지 마."] }
                guard self.epoch == attempt else { return }
                let data = (try? JSONSerialization.data(withJSONObject: output)) ?? Data("{}".utf8)
                self.send(["type": "conversation.item.create", "item": ["type": "function_call_output", "call_id": id,
                                                                           "output": String(decoding: data, as: UTF8.self)]])
            }
            guard self.epoch == attempt, self.ledger.turn == startedTurn else { return }
            self.ledger.nextRound()
            self.send(["type": "response.create", "response": ["tool_choice": self.ledger.rounds >= 4 ? "none" : "auto"]])
        })
    }
}
