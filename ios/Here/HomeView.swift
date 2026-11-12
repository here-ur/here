import SwiftUI

struct HomeView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var chatOpen = false
    @State private var settingsOpen = false
    @State private var draft = ""
    @State private var featureNotice = false
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
                    Image("Cat").resizable().scaledToFit().frame(height: 105)
                        .accessibilityLabel(name).padding(.bottom, 4)
                } else {
                    Spacer()
                    Image("Cat").resizable().scaledToFit()
                        .frame(maxWidth: 310, maxHeight: 320)
                        .shadow(color: .black.opacity(0.07), radius: 20, y: 12)
                        .accessibilityLabel(name)
                    Spacer()
                }
            }
            .background(Palette.surface(model.profile?.color ?? "mint").ignoresSafeArea())
            .safeAreaInset(edge: .bottom, spacing: 0) { composer }
            .navigationTitle("here")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("캐릭터 설정", systemImage: "slider.horizontal.3") { settingsOpen = true }.disabled(model.isPreview)
                        Button("새 대화", systemImage: "square.and.pencil") { model.messages = []; model.chatError = "" }.disabled(model.sending)
                        Button("로그아웃", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { Task { await model.signOut() } }.disabled(model.sending || model.busy)
                    } label: { Image(systemName: "line.3.horizontal").frame(minWidth: 44, minHeight: 44).accessibilityLabel("메뉴") }
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
            .alert("음성 대화는 준비 중이에요", isPresented: $featureNotice) {
                Button("확인", role: .cancel) { }
            } message: { Text("이번 iOS 첫 버전에서는 텍스트로 대화할 수 있어요. 마이크는 켜지지 않아요.") }
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
            HStack(spacing: 16) {
                if chatOpen {
                    TextField("\(name)에게 이야기해 줘", text: $draft, axis: .vertical)
                        .lineLimit(1...5).padding(.horizontal, 18).padding(.vertical, 14)
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 26))
                        .focused($focused)
                        .disabled(model.sending)
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
                        withAnimation(reduceMotion ? nil : .snappy) { chatOpen = true }
                        focused = true
                    } label: { Image(systemName: "bubble.left").font(.system(size: 26)).frame(width: 56, height: 56) }
                        .accessibilityLabel("글로 이야기하기")
                    Button { featureNotice = true } label: { Image(systemName: "mic").font(.system(size: 28)).frame(width: 56, height: 56) }
                        .accessibilityLabel("음성 대화, 준비 중")
                }
            }.foregroundStyle(Palette.ink)
            Text("AI와의 대화예요 · 진단과 치료는 전문가가 해요")
                .font(.caption2).foregroundStyle(.secondary).multilineTextAlignment(.center)
        }
        .padding(.horizontal, 24).padding(.top, 10).padding(.bottom, 12)
        .background(Palette.surface(model.profile?.color ?? "mint"))
    }

    private func markdown(_ content: String) -> AttributedString {
        (try? AttributedString(markdown: content, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(content)
    }
}
