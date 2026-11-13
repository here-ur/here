import SwiftUI

struct MainTabView: View {
    enum Tab { case home, garden, library, friends }
    @State private var selected: Tab = .home
    @State private var seedDraft: String?
    var body: some View {
        TabView(selection: $selected) {
            HomeView(seedDraft: $seedDraft)
                .tabItem { Label("홈", systemImage: "house") }.tag(Tab.home)
            NavigationStack {
                CloudGardenView { seed in seedDraft = seed.draft; selected = .home }
            }.tabItem { Label("구름 정원", systemImage: "cloud") }.tag(Tab.garden)
            NavigationStack { LibraryView() }
                .tabItem { Label("라이브러리", systemImage: "books.vertical") }.tag(Tab.library)
            NavigationStack { FriendsView() }
                .tabItem { Label("친구", systemImage: "person.2") }.tag(Tab.friends)
        }
    }
}

private struct FeatureCard<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        VStack(alignment: .leading, spacing: 16) { content }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(20).background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 24))
    }
}

struct CloudGardenView: View {
    @EnvironmentObject var model: AppModel
    var onSeed: (StorySeed) -> Void
    private var plants: [(String, GardenTopic)] {
        model.journal.flatMap { day in day.plants.sorted { $0.rawValue < $1.rawValue }.map { (day.date, $0) } }
    }
    private let levels = [(0, "작은 구름"), (5, "구름 언덕"), (12, "구름 숲"), (24, "큰 구름 섬"), (40, "하늘 정원")]
    private var level: Int { levels.lastIndex { plants.count >= $0.0 } ?? 0 }
    private var collected: Set<String> {
        Set(model.journal.flatMap { day in day.sky.map { sky in day.plants.map { $0.rawValue + ":" + sky.rawValue } } ?? [] })
    }
    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                ZStack {
                    RoundedRectangle(cornerRadius: 32).fill(LinearGradient(colors: [Color(red: 0.83, green: 0.90, blue: 0.91), Color(red: 0.94, green: 0.95, blue: 0.89)], startPoint: .top, endPoint: .bottom))
                    Image(systemName: "cloud.fill").font(.system(size: 150)).foregroundStyle(.white.opacity(0.55)).offset(x: -50, y: 12)
                    Ellipse().fill(Color(red: 0.69, green: 0.79, blue: 0.64)).frame(width: 260, height: 54).offset(y: 84)
                    HStack(alignment: .bottom, spacing: 10) {
                        ForEach(Array(plants.suffix(6).enumerated()), id: \.offset) { item in
                            Image(systemName: item.element.1.symbol).font(.system(size: 24)).foregroundStyle(.green.opacity(0.7))
                        }
                    }.offset(y: 68)
                    CompanionCatView().frame(height: 185).offset(y: -3).accessibilityHidden(true)
                }.frame(height: 260).accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(levels[level].1), 이야기 식물 \(plants.count)개")
                FeatureCard {
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("우리의 구름 정원").font(.subheadline).foregroundStyle(.secondary)
                            Text(levels[level].1).font(.title2.bold())
                        }
                        Spacer()
                        Text("Lv.\(level + 1)").font(.headline).padding(10).background(.quaternary, in: Capsule())
                    }
                    if level < levels.count - 1 {
                        ProgressView(value: Double(plants.count - levels[level].0), total: Double(levels[level + 1].0 - levels[level].0)).tint(.green)
                        Text("\(levels[level + 1].1)까지 식물 \(levels[level + 1].0 - plants.count)개").font(.caption).foregroundStyle(.secondary)
                    }
                    Text(plants.isEmpty ? "이야기를 나누면 첫 새싹이 자라요." : "나눈 이야기의 주제마다 식물이 하나씩 자라요. 쉬어 가도 시들지 않아요.").font(.subheadline)
                }
                FeatureCard {
                    Text("오늘의 이야기 씨앗").font(.headline)
                    ForEach(StorySeed.offered(on: JournalCalendar.key(Date()))) { seed in
                        Button {
                            model.chooseSeed(seed); onSeed(seed)
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: seed.topic.symbol).foregroundStyle(.green).frame(width: 24)
                                Text(seed.title).foregroundStyle(.primary)
                                Spacer()
                                Image(systemName: "arrow.up.right").font(.caption).foregroundStyle(.secondary)
                            }.frame(minHeight: 36)
                        }.buttonStyle(.plain)
                    }
                }
                FeatureCard {
                    HStack { Text("정원 도감").font(.headline); Spacer(); Text("\(collected.count) / 30").font(.caption).foregroundStyle(.secondary) }
                    Text("이야기한 주제와 직접 고른 하늘이 만나면 도감에 남아요.").font(.subheadline).foregroundStyle(.secondary)
                    ForEach(GardenTopic.allCases) { topic in
                        HStack {
                            Label(topic.title, systemImage: topic.symbol).font(.caption).frame(width: 100, alignment: .leading)
                            ForEach(DaySky.allCases) { sky in
                                let unlocked = collected.contains(topic.rawValue + ":" + sky.rawValue)
                                Image(systemName: unlocked ? sky.symbol : "circle.dotted")
                                    .font(.caption).frame(maxWidth: .infinity).foregroundStyle(unlocked ? Color.orange : Color.secondary.opacity(0.4))
                                    .accessibilityLabel("\(topic.title), \(sky.title), \(unlocked ? "수집 완료" : "아직 없음")")
                            }
                        }
                    }
                }
                JournalNotice()
            }.padding(20)
        }.background(Color(.systemGroupedBackground)).navigationTitle("구름 정원")
    }
}

struct LibraryView: View {
    enum Category: String, CaseIterable { case sky = "하늘", days = "하루하루", memories = "기억", numbers = "숫자" }
    @EnvironmentObject var model: AppModel
    @State private var category: Category = .sky
    @State private var month = Date()
    private var monthDays: [JournalDay] { model.journal.filter { $0.date.hasPrefix(String(JournalCalendar.key(month).prefix(7))) } }
    var body: some View {
        VStack(spacing: 0) {
            Picker("라이브러리 종류", selection: $category) {
                ForEach(Category.allCases, id: \.self) { Text($0.rawValue).tag($0) }
            }.pickerStyle(.segmented).padding(.horizontal, 20).padding(.vertical, 12)
            if category == .memories { MemoryListView() }
            else {
                ScrollView {
                    VStack(spacing: 20) {
                        HStack {
                            Button { changeMonth(-1) } label: { Image(systemName: "chevron.left").frame(width: 44, height: 44) }.accessibilityLabel("이전 달")
                                .disabled(JournalCalendar.calendar.compare(month, to: earliestMonth, toGranularity: .month) != .orderedDescending)
                            Spacer()
                            Text(month.formatted(.dateTime.year().month(.wide).locale(Locale(identifier: "ko_KR")))).font(.headline)
                            Spacer()
                            Button { changeMonth(1) } label: { Image(systemName: "chevron.right").frame(width: 44, height: 44) }.accessibilityLabel("다음 달")
                                .disabled(JournalCalendar.calendar.isDate(month, equalTo: Date(), toGranularity: .month))
                        }
                        switch category {
                        case .sky: calendar
                        case .days: days
                        case .numbers: numbers
                        case .memories: EmptyView()
                        }
                        JournalNotice()
                    }.padding(20)
                }
            }
        }.background(Color(.systemGroupedBackground)).navigationTitle("라이브러리")
    }
    private var earliestMonth: Date {
        let first = model.journal.first.flatMap { JournalCalendar.date($0.date) } ?? Date()
        return JournalCalendar.calendar.date(from: JournalCalendar.calendar.dateComponents([.year, .month], from: first))!
    }
    private func changeMonth(_ offset: Int) {
        let start = JournalCalendar.calendar.date(from: JournalCalendar.calendar.dateComponents([.year, .month], from: month))!
        month = JournalCalendar.calendar.date(byAdding: .month, value: offset, to: start)!
    }
    private var calendar: some View {
        FeatureCard {
            Text("내가 고른 하늘").font(.headline)
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 14) {
                ForEach(Array(["일", "월", "화", "수", "목", "금", "토"].enumerated()), id: \.offset) { item in
                    Text(item.element).font(.caption).foregroundStyle(.secondary)
                }
                ForEach(Array(JournalCalendar.days(in: month).enumerated()), id: \.offset) { item in
                    if let date = item.element {
                        let key = JournalCalendar.key(date)
                        let day = monthDays.first { $0.date == key }
                        NavigationLink { JournalDayView(date: key) } label: {
                            VStack(spacing: 7) {
                                Text("\(JournalCalendar.calendar.component(.day, from: date))").font(.caption)
                                Image(systemName: day?.sky?.symbol ?? (day?.sent ?? 0 > 0 ? "bubble.left.fill" : "circle.dotted"))
                                    .font(.system(size: 19)).foregroundStyle(day?.sky == nil ? Color.secondary.opacity(0.4) : Color.orange)
                            }.frame(maxWidth: .infinity, minHeight: 50)
                                .background(JournalCalendar.calendar.isDateInToday(date) ? Color.primary.opacity(0.05) : Color.clear, in: RoundedRectangle(cornerRadius: 12))
                        }.buttonStyle(.plain).disabled(key > JournalCalendar.key(Date()))
                            .accessibilityLabel("\(key), \(day?.sky?.title ?? "고른 하늘 없음")")
                    } else { Color.clear.frame(height: 50) }
                }
            }
            Text("날짜를 눌러 그날의 하늘을 골라요.").font(.caption).foregroundStyle(.secondary)
        }
    }
    private var days: some View {
        FeatureCard {
            if monthDays.isEmpty {
                ContentUnavailableView("아직 기록이 없어요", systemImage: "calendar", description: Text("이 앱에서 나눈 이야기와 직접 고른 하늘이 모여요."))
            } else {
                ForEach(monthDays.reversed()) { day in
                    NavigationLink { JournalDayView(date: day.date) } label: {
                        HStack {
                            Image(systemName: day.sky?.symbol ?? "bubble.left").foregroundStyle(.orange).frame(width: 36)
                            VStack(alignment: .leading, spacing: 4) {
                                Text(day.date).foregroundStyle(.primary)
                                Text("내 이야기 \(day.sent)번 · 답변 \(day.replies)번").font(.caption).foregroundStyle(.secondary)
                            }
                            Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 8)
                    }
                }
            }
        }
    }
    private var numbers: some View {
        FeatureCard {
            Text("이번 달 이야기").font(.headline)
            LabeledContent("이야기한 날", value: "\(monthDays.filter { $0.sent > 0 }.count)일")
            LabeledContent("내가 보낸 이야기", value: "\(monthDays.reduce(0) { $0 + $1.sent })번")
            LabeledContent("고양이의 답변", value: "\(monthDays.reduce(0) { $0 + $1.replies })번")
            Divider()
            ForEach(GardenTopic.allCases) { topic in
                LabeledContent(topic.title, value: "\(monthDays.filter { $0.plants.contains(topic) }.count)일")
            }
            Text("텍스트와 음성에서 확정된 발언을 세요. 통화 시간이나 감정 점수가 아니에요.").font(.caption).foregroundStyle(.secondary)
        }
    }
}

struct JournalDayView: View {
    @EnvironmentObject var model: AppModel
    let date: String
    private var day: JournalDay { model.journal.first { $0.date == date } ?? JournalDay(date: date) }
    var body: some View {
        Form {
            Section("그날의 이야기") {
                LabeledContent("내 이야기", value: "\(day.sent)번")
                LabeledContent("고양이의 답변", value: "\(day.replies)번")
                if !day.plants.isEmpty {
                    Text(day.plants.sorted { $0.rawValue < $1.rawValue }.map(\.title).joined(separator: " · ")).foregroundStyle(.secondary)
                }
            }
            Section {
                ForEach(DaySky.allCases) { sky in
                    Button { model.setSky(sky, date: date) } label: {
                        HStack {
                            Label(sky.title, systemImage: sky.symbol).foregroundStyle(.primary)
                            Spacer()
                            if day.sky == sky { Image(systemName: "checkmark").foregroundStyle(.green) }
                        }
                    }.disabled(model.isPreview)
                }
                if day.sky != nil { Button("선택 지우기", role: .destructive) { model.setSky(nil, date: date) } }
            } header: { Text("내가 고른 하늘") } footer: { Text("내가 느낀 하루를 골라요. 언제든 바꿀 수 있어요.") }
            Section { JournalNotice() }
        }.navigationTitle(date).navigationBarTitleDisplayMode(.inline)
    }
}

private struct JournalNotice: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !model.journalError.isEmpty {
                ErrorText(text: model.journalError)
                Button("다시 시도") { model.retryJournal() }
            }
            Text(model.isPreview ? "화면 미리보기예요. 로그인하면 내 기록을 쌓을 수 있어요." : "하늘·대화 횟수·이야기 주제는 이 기기에 계정별로 저장돼요. 웹 기록과 합쳐지지 않으며 대화 원문은 보관하지 않아요.")
                .font(.caption).foregroundStyle(.secondary)
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct MemoryListView: View {
    @EnvironmentObject var model: AppModel
    @State private var result: MemoriesResponse?
    @State private var error = ""
    @State private var loading = false
    var body: some View {
        List {
            Section {
                Text("대화에서 정리한 기억이에요. 같은 계정으로 나눈 웹·음성 대화의 요약도 함께 보여요.").font(.subheadline).foregroundStyle(.secondary)
            }
            if loading { ProgressView("기억을 불러오는 중") }
            else if !error.isEmpty { Section { ErrorText(text: error); Button("다시 시도") { Task { await load() } } } }
            else if let result {
                if !result.available { Text("기억 기능이 아직 열리지 않았어요.").foregroundStyle(.secondary) }
                else if result.memories.isEmpty { ContentUnavailableView("저장된 기억이 없어요", systemImage: "sparkles", description: Text("대화에서 정리한 요약이 저장되면 여기에 보여요.")) }
                else {
                    Section("최근 저장된 기억") {
                        ForEach(result.memories) { memory in
                            VStack(alignment: .leading, spacing: 8) {
                                Text(memory.summary).textSelection(.enabled)
                                Text(String(memory.created_at.prefix(10))).font(.caption).foregroundStyle(.secondary)
                            }.padding(.vertical, 6)
                        }
                    }
                    Text("최근 100개까지 표시해요. 요약 생성에는 시간이 걸릴 수 있어요.").font(.caption).foregroundStyle(.secondary)
                }
            }
        }.listStyle(.insetGrouped).refreshable { await load() }.task { await load() }
    }
    private func load() async {
        guard !loading else { return }
        loading = true; error = ""; result = nil
        defer { loading = false }
        do { result = try await model.loadMemories() }
        catch { self.error = (error as? APIError)?.error ?? "기억을 불러오지 못했어요. 다시 시도해 주세요." }
    }
}

struct FriendsView: View {
    @EnvironmentObject var model: AppModel
    @State private var friends: [MemberFriend] = []
    @State private var loading = false
    @State private var inviting = false
    @State private var error = ""
    @State private var inviteError = ""
    @State private var code: String?
    private var invitation: String { "Here!에서 같이 이야기해요.\n초대코드: \(code ?? "")\nhttps://here-dev.vercel.app 에서 '초대코드로 가입'을 눌러 주세요. 코드 하나로 3명까지 가입할 수 있어요." }
    var body: some View {
        List {
            Section {
                if loading { ProgressView("친구를 불러오는 중") }
                else if !error.isEmpty { ErrorText(text: error); Button("다시 시도") { Task { await load() } } }
                else if friends.isEmpty { ContentUnavailableView("아직 친구가 없어요", systemImage: "person.2", description: Text("초대장을 보내 함께 이야기해 봐요.")) }
                else {
                    ForEach(Array(friends.enumerated()), id: \.offset) { item in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(item.element.display_name?.isEmpty == false ? item.element.display_name! : "이름을 정하지 않은 친구")
                            Text(item.element.relation == "invited_by_me" ? "내가 초대한 친구" : "나를 초대한 친구").font(.caption).foregroundStyle(.secondary)
                        }.padding(.vertical, 5)
                    }
                }
            } header: { Text("친구 목록") } footer: { Text("친구에게는 닉네임과 가입일만 보여요. 대화와 기억은 공유하지 않아요.") }
            Section {
                if let code {
                    Text(code).font(.title3.monospaced().bold()).textSelection(.enabled)
                    ShareLink(item: invitation) { Label("초대장 공유", systemImage: "square.and.arrow.up") }
                    Button { UIPasteboard.general.string = invitation } label: { Label("초대장 복사", systemImage: "doc.on.doc") }
                } else {
                    Button { Task { await invite() } } label: {
                        HStack { Label("초대코드 만들기", systemImage: "person.badge.plus"); Spacer(); if inviting { ProgressView() } }
                    }.disabled(inviting || model.isPreview)
                }
                ErrorText(text: inviteError)
            } header: { Text("친구 초대하기") } footer: { Text("개발 서버용 초대코드예요. 공유 화면에서 카카오톡이나 메시지를 선택할 수 있어요.") }
        }.navigationTitle("친구").refreshable { await load() }.task { await load() }
    }
    private func load() async {
        guard !loading else { return }
        loading = true; error = ""; friends = []
        defer { loading = false }
        do { friends = try await model.loadFriends() }
        catch { self.error = (error as? APIError)?.error ?? "친구 목록을 불러오지 못했어요." }
    }
    private func invite() async {
        guard !inviting else { return }
        inviting = true; inviteError = ""
        defer { inviting = false }
        do { code = try await model.createFriendInvite() }
        catch { inviteError = (error as? APIError)?.error ?? "초대코드를 만들지 못했어요. 다시 시도해 주세요." }
    }
}

struct SettingsView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var quota: ConversationQuota?
    @State private var quotaError = ""
    @State private var signOutConfirm = false
    var body: some View {
        NavigationStack {
            Form {
                Section("오늘 남은 대화") {
                    if let quota {
                        LabeledContent("텍스트 메시지", value: "\(quota.chat.remaining)회")
                        LabeledContent("음성 연결", value: "\(quota.realtime.remaining)회")
                    } else if !quotaError.isEmpty { Text(quotaError).foregroundStyle(.secondary); Button("다시 시도") { Task { await load() } } }
                    else { ProgressView() }
                }
                Section("내 데이터") {
                    NavigationLink("저장된 기억") { MemoryListView().navigationTitle("저장된 기억") }
                    DisclosureGroup("기록 저장 안내") {
                        Text("대화 요약과 임베딩은 서버에 계정별로 저장해요. iOS의 하늘·대화 횟수·정원 주제는 이 기기에 최대 1년간 저장해요. 대화 원문과 음성 파일은 이 앱에 영구 저장하지 않아요.")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Section("앱 정보") {
                    LabeledContent("앱 버전", value: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—")
                    LabeledContent("환경", value: "Here Dev")
                    Text("이용약관·개인정보 처리방침은 운영 배포 전 확정 예정이에요.").font(.caption).foregroundStyle(.secondary)
                }
                Section {
                    Button("로그아웃", role: .destructive) { signOutConfirm = true }.disabled(model.busy || model.sending)
                    ErrorText(text: model.error)
                }
            }.navigationTitle("설정").navigationBarTitleDisplayMode(.inline)
                .toolbar { ToolbarItem(placement: .confirmationAction) { Button("닫기") { dismiss() } } }
                .task { await load() }
                .confirmationDialog("로그아웃할까요?", isPresented: $signOutConfirm, titleVisibility: .visible) {
                    Button("로그아웃", role: .destructive) { Task { await model.signOut(); if model.gate == .login { dismiss() } } }
                } message: { Text("다음 로그인에는 휴대폰 인증이 필요해요. 저장된 캐릭터 설정과 기억은 유지돼요.") }
        }
    }
    private func load() async {
        quotaError = ""
        do { quota = try await model.loadQuota() }
        catch { quotaError = (error as? APIError)?.error ?? "남은 대화량을 확인하지 못했어요." }
    }
}
