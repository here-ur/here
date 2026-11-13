import SwiftUI

struct HomeView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Binding var seedDraft: String?
    @State private var preferencesOpen = false
    @State private var chatOpen = false
    @State private var settingsOpen = false
    @State private var draft = ""
    @StateObject private var voice = VoiceConversation()
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.openURL) private var openURL
    @FocusState private var focused: Bool
    private var name: String { model.profile?.companion ?? "몽글이" }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                if model.isPreview {
                    HStack {
                        Label("화면 미리보기 · 대화 전송 안 함", systemImage: "eye")
                        Spacer()
                        Button("로그인") { Task { await model.leavePreview() } }
                    }.font(.caption).padding(.horizontal, 20).padding(.vertical, 10)
                    .background(.thinMaterial)
                }
                if chatOpen {
                    transcript
                    CompanionCatView(speechLevel: voice.level).frame(height: 105)
                        .accessibilityLabel(name).padding(.bottom, 4)
                } else {
                    Spacer()
                    CompanionCatView(speechLevel: voice.level)
                        .frame(maxWidth: 310, maxHeight: 320)
                        .shadow(color: .black.opacity(0.07), radius: 20, y: 12)
                        .accessibilityLabel(name)
                    Spacer()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Palette.surface(model.profile?.color ?? "mint").ignoresSafeArea())
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
            .navigationTitle("here")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("캐릭터 설정", systemImage: "slider.horizontal.3") { settingsOpen = true }.disabled(model.isPreview || voice.active)
                        Button("새 대화", systemImage: "square.and.pencil") { model.messages = []; model.chatError = "" }.disabled(model.sending || voice.active)
                        Button("도움받기 · 준비 중", systemImage: "heart") {}.disabled(true)
                        Divider()
                        Button("설정", systemImage: "gearshape") { voice.stop(); preferencesOpen = true }
                    } label: { Image(systemName: "gearshape").accessibilityLabel("캐릭터와 설정") }
                    .buttonBorderShape(.circle)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    if chatOpen {
                        Button("닫기", systemImage: "xmark") { focused = false; withAnimation(reduceMotion ? nil : .snappy) { chatOpen = false } }
                            .accessibilityLabel("텍스트 대화 닫기")
                    } else {
                        Text("DEV").font(.caption2.weight(.semibold)).foregroundStyle(.secondary)
                    }
                }
            }
            .sheet(isPresented: $settingsOpen) { ProfileView() }
            .sheet(isPresented: $preferencesOpen) { SettingsView() }
            .onChange(of: seedDraft, initial: true) { _, text in
                guard let text else { return }
                voice.stop(); draft = text; chatOpen = true; focused = true; seedDraft = nil
            }
            .onDisappear { voice.stop() }
            .onChange(of: scenePhase) { _, phase in
                if phase == .background { voice.stop() }
            }
            .alert("안내", isPresented: Binding(get: { !voice.helpNotice.isEmpty }, set: { if !$0 { voice.helpNotice = "" } })) {
                Button("확인", role: .cancel) { voice.helpNotice = "" }
            } message: { Text(voice.helpNotice) }
        }
    }

    private var transcript: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 20) {
                    if model.messages.isEmpty {
                        Text("\(name)에게 메시지 보내기").font(.callout).foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity).padding(.top, 40)
                    }
                    ForEach(model.messages) { message in
                        HStack(alignment: .top) {
                            if message.role == "user" { Spacer(minLength: 36) }
                            Text(markdown(message.content))
                                .textSelection(.enabled).lineSpacing(5)
                                .padding(16)
                                .background(message.role == "user" ? Color.white.opacity(0.65) : Color.clear, in: RoundedRectangle(cornerRadius: 22))
                            if message.role == "assistant" { Spacer(minLength: 16) }
                        }.id(message.id)
                    }
                    if model.sending { ProgressView("생각 중").font(.caption).padding(.horizontal) }
                    ErrorText(text: model.chatError)
                    Color.clear.frame(height: 1).id("bottom")
                }.padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: model.messages.count) { _, _ in
                withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { proxy.scrollTo("bottom", anchor: .bottom) }
            }
        }
    }

    private var composer: some View {
        VStack(spacing: 12) {
            if voice.active {
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        if voice.phase == .preparing { ProgressView().controlSize(.small) }
                        else { Image(systemName: voice.muted ? "mic.slash" : "waveform") }
                        Text(voice.status)
                    }.font(.caption).foregroundStyle(.secondary)
                    if !voice.transcript.isEmpty {
                        ScrollView { Text(voice.transcript).font(.callout).multilineTextAlignment(.center).textSelection(.enabled) }
                            .frame(maxHeight: 100)
                    }
                }
            }
            if !voice.sources.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack {
                        ForEach(voice.sources) { source in
                            if let url = source.safeURL { Link(source.title, destination: url).font(.caption).lineLimit(1) }
                        }
                    }
                }
            }
            ErrorText(text: voice.error)
            if !voice.warning.isEmpty { Text(voice.warning).font(.caption).foregroundStyle(.secondary) }
            if voice.permissionDenied {
                Button("마이크 설정 열기") { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } }
                    .font(.caption)
            }
            HStack(spacing: 16) {
                if chatOpen {
                    TextField("\(name)에게 이야기해 줘", text: $draft, axis: .vertical)
                        .lineLimit(1...5).padding(.horizontal, 18).padding(.vertical, 14)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26))
                        .focused($focused)
                        .disabled(model.sending || voice.active)
                    Button {
                        Task { if await model.send(draft) { draft = "" } }
                    } label: {
                        Image(systemName: "arrow.up").font(.title3.weight(.semibold)).frame(width: 48, height: 48)
                            .background(Palette.ink, in: Circle()).foregroundStyle(.white)
                    }
                    .disabled(model.sending || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .opacity(model.sending || draft.isEmpty ? 0.4 : 1)
                    .accessibilityLabel("메시지 보내기")
                } else {
                    Spacer()
                    Button {
                        voice.stop()
                        withAnimation(reduceMotion ? nil : .snappy) { chatOpen = true }
                        focused = true
                    } label: { Image(systemName: "bubble.left").font(.system(size: 26)).frame(width: 56, height: 56) }
                        .accessibilityLabel("글로 이야기하기")
                    if voice.active {
                        HStack(spacing: 4) {
                            Button { voice.stop() } label: {
                                Image(systemName: "xmark").font(.headline).frame(width: 48, height: 48)
                                    .foregroundStyle(.white).background(Color.red, in: Circle())
                            }.accessibilityLabel("음성 대화 끝내기")
                            Divider().frame(height: 28).padding(.horizontal, 6)
                            Button { voice.mute() } label: {
                                Image(systemName: voice.muted ? "mic.slash" : "mic").font(.system(size: 26)).frame(width: 48, height: 48)
                            }
                            .disabled(voice.phase == .preparing)
                            .accessibilityLabel(voice.muted ? "마이크 켜기" : "마이크 끄기")
                        }
                        .padding(6).background(.regularMaterial, in: Capsule())
                        .transition(.opacity.combined(with: .scale(scale: 0.96, anchor: .trailing)))
                    } else {
                        Button { startVoice() } label: { Image(systemName: "mic").font(.system(size: 28)).frame(width: 56, height: 56) }
                            .disabled(model.sending || model.busy)
                            .accessibilityLabel("음성 대화 시작")
                    }
                }
            }.foregroundStyle(Palette.ink)
                .animation(reduceMotion ? nil : .snappy(duration: 0.25), value: voice.active)
            Text("AI와의 대화예요 · 진단과 치료는 전문가가 해요")
                .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(.horizontal, 24).padding(.top, 10).padding(.bottom, 12)
        .background(Palette.surface(model.profile?.color ?? "mint"))
    }

    private func startVoice() {
        do {
            let request = try model.voiceRequest()
            let persona = ["name": name, "voice": model.profile?.voice ?? "marin"]
            Task {
                await voice.start(request: request, persona: persona) { role, text in
                    model.recordConversation(role: role, text: text)
                    model.messages.append(ChatMessage(role: role, content: text))
                }
            }
        } catch { voice.error = (error as? APIError)?.error ?? "로그인 상태를 확인해 주세요." }
    }

    private func markdown(_ content: String) -> AttributedString {
        (try? AttributedString(markdown: content, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(content)
    }
}
