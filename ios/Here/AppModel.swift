import Foundation
import Combine
import Supabase
import OSLog

@MainActor
final class AppModel: ObservableObject {
    enum Gate { case loading, login, invite, consent, profile, home, retry, configuration }
    @Published var gate: Gate = .loading
    @Published var busy = false
    @Published var error = ""
    @Published var profile: CompanionProfile?
    @Published var messages: [ChatMessage] = []
    @Published var sending = false
    @Published var chatError = ""
    @Published var isPreview = false
    @Published var consentVersion: String?
    @Published private(set) var journal: [JournalDay] = []
    @Published var journalError = ""
    private let journalStore = JournalStore()
    private var journalLoaded = false
    private let client: SupabaseClient?
    private let apiURL: URL
    private var restored = false
    private var storageChecked = false
    private var accountID: UUID?
    private var pendingInvite: String?
    private var accountStage = "계정"

    init() {
        let config = Bundle.main.url(forResource: "Config", withExtension: "plist")
            .flatMap { NSDictionary(contentsOf: $0) as? [String: String] } ?? [:]
        apiURL = URL(string: "https://here-dev.vercel.app")!
        if let urlString = config["SUPABASE_URL"], let url = URL(string: urlString),
           url.scheme == "https", url.host == "mwjwfumpxdlllikcdvkh.supabase.co",
           !urlString.contains("YOUR_"), let key = config["SUPABASE_PUBLISHABLE_KEY"], !key.isEmpty, !key.contains("YOUR_") {
            client = SupabaseClient(supabaseURL: url, supabaseKey: key, options: .init(
                auth: .init(storage: KeychainLocalStorage(service: "com.hereur.here.dev.auth"), autoRefreshToken: true)
            ))
        } else { client = nil }
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--preview") { startPreview() }
        #endif
    }

    func startPreview() {
        #if DEBUG
        clearAccount()
        isPreview = true
        profile = .preview
        messages = []
        journal = []; journalError = ""
        error = ""
        gate = .home
        #endif
    }

    func leavePreview() async {
        isPreview = false
        profile = nil
        messages = []
        restored = false
        await restore()
    }

    func restore() async {
        guard !isPreview, !busy else { return }
        guard let client else {
            error = "개발 연결 설정이 없어요. ios/README.md의 Config.plist 설정을 확인해 주세요."
            gate = .configuration
            return
        }
        if !storageChecked {
            do {
                try SessionStorageCheck.verify(KeychainLocalStorage(service: "com.hereur.here.dev.auth"))
                storageChecked = true
            } catch {
                self.error = "로그인 정보를 안전하게 저장할 수 없어요. 서명된 앱으로 다시 실행해 주세요."
                gate = .configuration
                return
            }
        }
        busy = true
        if gate != .home { gate = .loading }
        defer { busy = false; restored = true }
        do {
            // SDK refreshes expired access tokens from Keychain, before membership checks.
            _ = try await client.auth.session
            try await loadAccount()
            error = ""
        } catch AuthError.sessionMissing {
            clearAccount()
            gate = .login
        } catch {
            self.error = accountFailure(error)
            // An outage or failed profile lookup must never become first-time onboarding.
            if gate != .home { gate = .retry }
        }
    }

    func refreshIfNeeded() async {
        guard restored, !isPreview, !busy, !sending, gate == .home else { return }
        await restore()
    }

    private func loadAccount() async throws {
        guard let client else { throw APIError(error: "개발 연결 설정이 없어요.") }
        accountStage = "계정 인증"
        let user = try await client.auth.user()
        if accountID != user.id {
            messages = []; profile = nil; journal = []; journalError = ""
            journalLoaded = false
            do { journal = try journalStore.load(account: user.id); journalLoaded = true }
            catch { journalError = "이 기기의 기록을 불러오지 못했어요. 다시 시도해 주세요." }
        }
        accountID = user.id
        struct Member: Decodable { let user_id: UUID }
        accountStage = "회원 정보"
        let members: [Member] = try await client.from("members").select("user_id").eq("user_id", value: user.id.uuidString).execute().value
        if members.isEmpty {
            if let pendingInvite {
                let redeemed: Bool = try await client.rpc("redeem_invite", params: ["p_code": pendingInvite]).execute().value
                self.pendingInvite = nil
                if redeemed { try await loadAccount(); return }
            }
            gate = .invite
            return
        }
        accountStage = "이용 동의"
        let consent: ConsentStatus = try await api("memory-consent")
        consentVersion = consent.version
        if consent.required {
            guard consent.version == "2026-10-31-dev-v1" else {
                throw APIError(error: "동의 내용이 변경됐어요. 최신 iOS 빌드를 사용해 주세요.")
            }
            gate = .consent
            return
        }
        accountStage = "캐릭터 설정"
        if let stored = user.userMetadata["here_profile_v1"], stored != .null {
            let envelope = try JSONDecoder().decode(ProfileEnvelope.self, from: JSONEncoder().encode(stored))
            guard envelope.version == 1 else { throw APIError(error: "새 버전의 캐릭터 설정이에요. 앱을 업데이트해 주세요.") }
            if let saved = envelope.profile {
                guard !saved.companion.trimmingCharacters(in: .whitespaces).isEmpty else { throw APIError(error: "캐릭터 설정을 확인하지 못했어요.") }
                profile = saved
                gate = .home
                return
            }
        }
        profile = nil
        gate = .profile
    }

    func checkInvite(_ input: String) async throws {
        guard let client, let code = InputRules.invite(input) else { throw APIError(error: "초대코드 16자리를 확인해 주세요.") }
        let valid: Bool = try await client.rpc("invite_available", params: ["p_code": code]).execute().value
        guard valid else { throw APIError(error: "사용할 수 없는 초대코드예요.") }
        pendingInvite = code
    }

    func sendOTP(phone: String, signup: Bool) async throws {
        guard let client, let number = InputRules.phone(phone) else { throw APIError(error: "휴대폰 번호를 확인해 주세요.") }
        if signup {
            guard let pendingInvite else { throw APIError(error: "초대코드를 먼저 확인해 주세요.") }
            try await checkInvite(pendingInvite)
        } else { pendingInvite = nil }
        try await client.auth.signInWithOTP(phone: number, shouldCreateUser: signup)
    }

    func verifyOTP(phone: String, code: String) async throws {
        guard let client, let number = InputRules.phone(phone) else { throw APIError(error: "휴대폰 번호를 확인해 주세요.") }
        try await client.auth.verifyOTP(phone: number, token: code.trimmingCharacters(in: .whitespaces), type: .sms)
        do { try await loadAccount() }
        catch { gate = .retry; self.error = accountFailure(error) }
    }

    func redeemInvite(_ input: String) async throws {
        guard let client, let code = InputRules.invite(input) else { throw APIError(error: "초대코드를 확인해 주세요.") }
        let valid: Bool = try await client.rpc("redeem_invite", params: ["p_code": code]).execute().value
        guard valid else { throw APIError(error: "사용할 수 없는 초대코드예요.") }
        try await loadAccount()
    }

    func acceptConsent(privacy: Bool, sensitive: Bool) async throws {
        guard privacy, sensitive, let consentVersion else { throw APIError(error: "각 동의 내용을 확인해 주세요.") }
        struct Accepted: Decodable { let ok: Bool }
        let result: Accepted = try await api("memory-consent", body: JSONEncoder().encode(ConsentRequest(version: consentVersion, privacy: privacy, sensitive: sensitive)))
        guard result.ok else { throw APIError(error: "동의를 저장하지 못했어요.") }
        try await loadAccount()
    }

    func saveProfile(nickname: String, companion: String, color: String) async throws {
        guard let client, let accountID else { throw APIError(error: "로그인이 필요해요.") }
        let name = InputRules.name(companion)
        guard !name.isEmpty else { throw APIError(error: "고양이 이름을 입력해 주세요.") }
        var next = profile ?? .preview
        next.nickname = String(nickname.trimmingCharacters(in: .whitespaces).prefix(20))
        next.companion = name
        next.color = color
        let current = try await client.auth.user()
        guard current.id == accountID else { throw APIError(error: "계정을 다시 확인해 주세요.") }
        let value = try JSONDecoder().decode(AnyJSON.self, from: JSONEncoder().encode(ProfileEnvelope(version: 1, profile: next)))
        let saved = try await client.auth.update(user: UserAttributes(data: ["here_profile_v1": value]))
        guard saved.id == accountID else { throw APIError(error: "설정을 저장하지 못했어요.") }
        profile = next
        // Same public nickname used by the web friends list; no phone number shared.
        _ = try? await client.rpc("set_display_name", params: ["p_name": next.nickname]).execute()
        gate = .home
    }

    private func api<T: Decodable>(_ path: String, body: Data? = nil) async throws -> T {
        try JSONDecoder().decode(T.self, from: await apiData(path, body: body))
    }

    func voiceRequest() throws -> (String, [String: Any]) async throws -> Data {
        guard !isPreview, gate == .home, let originalAccount = accountID else {
            throw APIError(error: "로그인하면 음성으로 대화할 수 있어요.")
        }
        return { [weak self] path, body in
            guard let self, self.accountID == originalAccount, !self.isPreview,
                  ["realtime", "voice-memory", "web-search"].contains(path) else { throw VoiceAccessError.revoked }
            return try await self.apiData(path, body: JSONSerialization.data(withJSONObject: body), account: originalAccount)
        }
    }

    private func apiData(_ path: String, body: Data? = nil, account: UUID? = nil) async throws -> Data {
        guard !isPreview, let client else { throw APIError(error: "로그인 후 이용해 주세요.") }
        for attempt in 0...1 {
            let session = try await client.auth.session
            if let account, session.user.id != account || accountID != account { throw VoiceAccessError.revoked }
            var request = URLRequest(url: apiURL.appendingPathComponent("api/" + path))
            request.httpMethod = body == nil ? "GET" : "POST"
            request.httpBody = body
            request.timeoutInterval = path == "chat" ? 125 : 20
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("Bearer \(session.accessToken)", forHTTPHeaderField: "Authorization")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let response = response as? HTTPURLResponse else { throw APIError(error: "서버 응답을 확인하지 못했어요.") }
            if let account, accountID != account { throw VoiceAccessError.revoked }
            if response.statusCode == 401, attempt == 0 { _ = try await client.auth.refreshSession(); continue }
            if account != nil && [401, 403].contains(response.statusCode) { throw VoiceAccessError.revoked }
            guard (200..<300).contains(response.statusCode) else {
                throw (try? JSONDecoder().decode(APIError.self, from: data)) ?? APIError(error: "서버에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.")
            }
            return data
        }
        throw APIError(error: "로그인 상태를 다시 확인해 주세요.")
    }

    func send(_ text: String) async -> Bool {
        guard !sending else { return false }
        let content = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !content.isEmpty, content.count <= 8000 else { chatError = "1~8,000자까지 보낼 수 있어요."; return false }
        guard !isPreview else { chatError = "화면 미리보기예요. 로그인하면 실제로 대화할 수 있어요."; return false }
        let startedAccount = accountID
        sending = true
        chatError = ""
        let pending = ChatMessage(role: "user", content: content)
        messages.append(pending)
        defer { sending = false }
        do {
            let result: ChatReply = try await api("chat", body: JSONEncoder().encode(ChatRequest(messages: InputRules.context(messages), name: profile?.companion ?? "몽글이")))
            guard accountID == startedAccount, !isPreview else { return false }
            recordConversation(role: "user", text: content, crisis: result.crisis)
            recordConversation(role: "assistant", text: result.reply)
            messages.append(ChatMessage(role: "assistant", content: result.reply))
            return true
        } catch {
            messages.removeAll { $0.id == pending.id }
            chatError = (error as? APIError)?.error ?? "답변을 받지 못했어요. 입력한 내용은 남겨뒀어요. 다시 시도해 주세요."
            return false
        }
    }

    func perform(_ action: () async throws -> Void) async -> Bool {
        guard !busy else { return false }
        busy = true; error = ""
        defer { busy = false }
        do { try await action(); return true }
        catch { self.error = (error as? APIError)?.error ?? "요청을 완료하지 못했어요. 입력 내용과 연결을 확인해 주세요."; return false }
    }

    func signOut() async {
        guard !busy, !sending else { return }
        if isPreview { await leavePreview(); return }
        let ok = await perform { try await client?.auth.signOut(scope: .local) }
        if ok { clearAccount(); gate = .login }
    }

    func recordConversation(role: String, text: String, crisis: Bool = false, now: Date = Date()) {
        guard !isPreview, accountID != nil, gate == .home else { return }
        let date = JournalCalendar.key(now)
        var day = journal.first(where: { $0.date == date }) ?? JournalDay(date: date)
        day.record(role: role, text: text, crisis: crisis, hour: JournalCalendar.calendar.component(.hour, from: now))
        updateJournal(day)
    }

    func setSky(_ sky: DaySky?, date: String) {
        guard !isPreview, JournalCalendar.date(date) != nil, date <= JournalCalendar.key(Date()) else { return }
        var day = journal.first(where: { $0.date == date }) ?? JournalDay(date: date)
        day.sky = sky
        updateJournal(day)
    }

    func chooseSeed(_ seed: StorySeed) {
        guard !isPreview else { return }
        let date = JournalCalendar.key(Date())
        var day = journal.first(where: { $0.date == date }) ?? JournalDay(date: date)
        day.seed = seed.id
        updateJournal(day)
    }

    func retryJournal() {
        guard let accountID, !isPreview else { return }
        do {
            if !journalLoaded { journal = try journalStore.load(account: accountID); journalLoaded = true }
            else { try journalStore.save(journal, account: accountID) }
            journalError = ""
        }
        catch { journalError = "기록을 저장하지 못했어요. 기기 저장 공간을 확인해 주세요." }
    }

    private func updateJournal(_ day: JournalDay) {
        guard let accountID, !isPreview, journalLoaded else { return }
        journal.removeAll { $0.date == day.date }
        journal.append(day); journal.sort { $0.date < $1.date }
        do { try journalStore.save(journal, account: accountID); journalError = "" }
        catch { journalError = "기록을 저장하지 못했어요. 기기 저장 공간을 확인해 주세요." }
    }

    func loadMemories() async throws -> MemoriesResponse {
        guard let accountID, !isPreview else { throw APIError(error: "로그인하면 저장된 기억을 확인할 수 있어요.") }
        return try JSONDecoder().decode(MemoriesResponse.self, from: await apiData("memories", account: accountID))
    }

    func loadQuota() async throws -> ConversationQuota {
        guard let accountID, !isPreview else { throw APIError(error: "로그인 후 확인할 수 있어요.") }
        return try JSONDecoder().decode(ConversationQuota.self, from: await apiData("quota", account: accountID))
    }

    func loadFriends() async throws -> [MemberFriend] {
        guard let client, let original = accountID, !isPreview, gate == .home else { throw APIError(error: "로그인하면 친구 목록을 볼 수 있어요.") }
        let rows: [MemberFriend] = try await client.rpc("list_friends").execute().value
        guard accountID == original, !isPreview else { throw VoiceAccessError.revoked }
        return rows
    }

    func createFriendInvite() async throws -> String {
        guard let client, let original = accountID, !isPreview, gate == .home else { throw APIError(error: "로그인하면 친구를 초대할 수 있어요.") }
        let code: String = try await client.rpc("create_invite_code").execute().value
        guard accountID == original, !isPreview, InputRules.invite(code) != nil else { throw VoiceAccessError.revoked }
        return code
    }

    private func accountFailure(_ error: Error) -> String {
        #if DEBUG
        // Diagnostics intentionally exclude tokens, phone numbers and metadata values.
        var detail = String(describing: type(of: error))
        if case DecodingError.keyNotFound(let key, _) = error { detail += ":missing:" + key.stringValue }
        if case DecodingError.typeMismatch(_, let context) = error { detail += ":type:" + context.codingPath.map(\.stringValue).joined(separator: ".") }
        if case DecodingError.dataCorrupted(let context) = error { detail += ":data:" + context.codingPath.map(\.stringValue).joined(separator: ".") }
        if let urlError = error as? URLError { detail += ":url:" + String(urlError.code.rawValue) }
        Logger(subsystem: "com.hereur.here.dev", category: "account").error("Account load failed stage=\(self.accountStage, privacy: .public) kind=\(detail, privacy: .public)")
        #endif
        return (error as? APIError)?.error ?? "\(accountStage)를 불러오지 못했어요. 다시 인증할 필요 없이 잠시 뒤 다시 시도해 주세요."
    }

    private func clearAccount() {
        profile = nil; messages = []; journal = []; journalError = ""; journalLoaded = false; accountID = nil; pendingInvite = nil; consentVersion = nil; chatError = ""
    }
}
