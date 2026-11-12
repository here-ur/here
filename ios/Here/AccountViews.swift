import SwiftUI

enum Palette {
    static let ink = Color(red: 0.15, green: 0.16, blue: 0.17)
    static let background = Color(.systemGroupedBackground)
    static func surface(_ name: String) -> Color {
        switch name {
        case "mint": Color(red: 0.914, green: 0.929, blue: 0.898)
        case "sky": Color(red: 0.929, green: 0.933, blue: 0.922)
        case "peach": Color(red: 0.941, green: 0.906, blue: 0.855)
        default: Color(red: 0.961, green: 0.949, blue: 0.922)
        }
    }
}

struct BusyButton: View {
    let title: String
    let busy: Bool
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            HStack {
                Spacer()
                if busy { ProgressView().tint(.white) } else { Text(title).fontWeight(.semibold) }
                Spacer()
            }.frame(minHeight: 36)
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.large)
        .disabled(busy)
    }
}

struct ErrorText: View {
    let text: String
    var body: some View {
        if !text.isEmpty { Text(text).font(.callout).foregroundStyle(.red).accessibilityLabel("오류. \(text)") }
    }
}

struct LoginView: View {
    enum Step { case invite, phone, otp }
    @EnvironmentObject var model: AppModel
    @State private var signup = false
    @State private var step: Step = .phone
    @State private var phone = ""
    @State private var code = ""
    @State private var invite = ""
    @State private var sentPhone = ""
    @State private var canResendAt = Date.distantPast

    var title: String {
        switch step {
        case .invite: "초대코드가 있나요?"
        case .phone: "휴대폰 번호로 시작해요"
        case .otp: "인증번호를 입력해 주세요"
        }
    }
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 12) {
                        Image("Cat").resizable().scaledToFit().frame(height: 110).accessibilityHidden(true)
                        Text(title).font(.title2.bold())
                        Text(step == .otp ? "\(sentPhone)로 보낸 번호를 입력해 주세요." : "Here 개발 계정으로 로그인해요. 기존 계정의 캐릭터 설정을 그대로 불러와요.")
                            .foregroundStyle(.secondary).font(.callout)
                    }.padding(.vertical, 8)
                }.listRowBackground(Color.clear)
                Section {
                    switch step {
                    case .invite:
                        TextField("초대코드 16자리", text: $invite).textInputAutocapitalization(.characters).autocorrectionDisabled()
                    case .phone:
                        TextField("010 1234 5678", text: $phone).keyboardType(.phonePad).textContentType(.telephoneNumber)
                            .accessibilityLabel("휴대폰 번호")
                    case .otp:
                        TextField("인증번호 6자리", text: $code).keyboardType(.numberPad).textContentType(.oneTimeCode)
                    }
                }
                Section {
                    ErrorText(text: model.error)
                    BusyButton(title: step == .otp ? "로그인" : step == .invite ? "초대코드 확인" : "인증번호 받기", busy: model.busy) {
                        Task { await advance() }
                    }.listRowBackground(Color.clear)
                    if step == .otp {
                        TimelineView(.periodic(from: .now, by: 1)) { timeline in
                            let remaining = max(0, Int(ceil(canResendAt.timeIntervalSince(timeline.date))))
                            Button(remaining > 0 ? "\(remaining)초 뒤 재전송 가능" : "인증번호 다시 받기") {
                                Task {
                                    if await model.perform({ try await model.sendOTP(phone: sentPhone, signup: signup) }) {
                                        canResendAt = Date().addingTimeInterval(60)
                                    }
                                }
                            }.disabled(remaining > 0 || model.busy)
                        }
                    } else {
                        Button(signup ? "이미 계정이 있어요" : "초대코드로 가입하기") {
                            signup.toggle(); step = signup ? .invite : .phone; model.error = ""
                        }.disabled(model.busy)
                    }
                }.listRowBackground(Color.clear)
                #if DEBUG
                Section {
                    Button("화면 미리보기") { model.startPreview() }
                } footer: { Text("미리보기에서는 로그인하거나 대화를 전송하지 않아요.") }
                #endif
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Here")
            .toolbar {
                if step != .phone {
                    ToolbarItem(placement: .topBarLeading) {
                        Button("뒤로", systemImage: "chevron.left") { step = .phone; signup = false; code = ""; model.error = "" }
                            .disabled(model.busy)
                    }
                }
            }
        }
    }

    private func advance() async {
        switch step {
        case .invite:
            if await model.perform({ try await model.checkInvite(invite) }) { step = .phone }
        case .phone:
            if await model.perform({ try await model.sendOTP(phone: phone, signup: signup) }) {
                sentPhone = InputRules.phone(phone) ?? phone
                code = ""; step = .otp; canResendAt = Date().addingTimeInterval(60)
            }
        case .otp:
            _ = await model.perform { try await model.verifyOTP(phone: sentPhone, code: code) }
        }
    }
}

struct InviteView: View {
    @EnvironmentObject var model: AppModel
    @State private var invite = ""
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("휴대폰 인증은 완료했어요. 초대코드를 입력하면 가입이 마무리돼요.")
                    TextField("초대코드 16자리", text: $invite).textInputAutocapitalization(.characters).autocorrectionDisabled()
                }
                Section {
                    ErrorText(text: model.error)
                    BusyButton(title: "가입 완료", busy: model.busy) { Task { _ = await model.perform { try await model.redeemInvite(invite) } } }
                    Button("로그아웃", role: .destructive) { Task { await model.signOut() } }.disabled(model.busy)
                }
            }.navigationTitle("초대코드 확인")
        }
    }
}

struct ConsentView: View {
    @EnvironmentObject var model: AppModel
    @State private var privacy = false
    @State private var sensitive = false
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("대화에서 정리한 기억을 계정별로 저장하고, 다음 이야기에 참고해요.")
                    Label("개발 검증용 동의서 초안이에요. 실제 개인정보나 건강정보 대신 가상의 테스트 이야기만 입력해 주세요.", systemImage: "info.circle")
                        .font(.callout).foregroundStyle(.secondary)
                }
                Section {
                    DisclosureGroup("개인정보 수집·이용 내용") {
                        Text("목적: 회원 확인과 사용자별 대화 기억·맞춤 답변 제공\n\n항목: 계정 식별자, 대화 요약, 기억 검색용 임베딩, 생성 시점과 동의 이력. 휴대폰 번호는 로그인에 이용해요.\n\n처리 방식: 텍스트 답변과 사용자 발언 요약은 Runyour AI, 음성 대화·받아쓰기와 임베딩은 OpenAI로 처리해요. 기억은 Supabase에 저장해요. 대화 원문·음성 파일을 기억 DB에 저장하지 않아요.\n\n보관기간 초안: 탈퇴 전까지 보유하고 탈퇴 후 1년 보관하는 정책을 검토 중이에요. 탈퇴 후 보관 목적·근거, 자동 파기와 국외 처리 고지는 운영 전 확정해야 해요.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                    Toggle("[필수] 개인정보 수집·이용 동의", isOn: $privacy)
                }
                Section {
                    DisclosureGroup("민감정보 처리 내용") {
                        Text("직접 이야기한 정신·신체 건강 관련 내용이 요약과 기억에 포함될 수 있어요. 개인별 대화를 이어가기 위한 용도로 처리하며, 공용 모델 학습에는 자동으로 사용하지 않아요. 목적·보관기간은 위 초안과 같아요.")
                            .font(.callout).foregroundStyle(.secondary)
                    }
                    Toggle("[필수] 민감정보 처리 동의", isOn: $sensitive)
                }
                Section {
                    Text("동의를 거부할 수 있어요. 이번 개발 테스트에서는 동의하지 않으면 대화를 시작할 수 없어요. 공용 모델 학습 동의는 포함되지 않아요.").font(.footnote).foregroundStyle(.secondary)
                    ErrorText(text: model.error)
                    Button("로그아웃하고 나가기", role: .destructive) { Task { await model.signOut() } }.disabled(model.busy)
                }
            }
            .navigationTitle("이야기를 이어가기 전에").navigationBarTitleDisplayMode(.inline)
            .safeAreaInset(edge: .bottom) {
                BusyButton(title: "동의하고 시작하기", busy: model.busy) {
                    Task { _ = await model.perform { try await model.acceptConsent(privacy: privacy, sensitive: sensitive) } }
                }.disabled(!privacy || !sensitive).padding().background(.regularMaterial)
            }
        }
    }
}

struct ProfileView: View {
    @EnvironmentObject var model: AppModel
    @Environment(\.dismiss) private var dismiss
    @State private var nickname = ""
    @State private var companion = ""
    @State private var color = "mint"
    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Image("Cat").resizable().scaledToFit().frame(height: 170).frame(maxWidth: .infinity)
                        .listRowBackground(Palette.surface(color)).accessibilityHidden(true)
                }
                Section {
                    TextField("내 이름", text: $nickname).textContentType(.nickname)
                    TextField("고양이 이름", text: $companion)
                } header: { Text("이름") } footer: { Text("고양이 이름은 한글·영문·숫자로 10자까지 입력할 수 있어요.") }
                Section("배경") {
                    Picker("색상", selection: $color) {
                        Text("아이보리").tag("lavender")
                        Text("스톤").tag("sky")
                        Text("세이지").tag("mint")
                        Text("샌드").tag("peach")
                    }
                }
                Section {
                    ErrorText(text: model.error)
                    BusyButton(title: "저장", busy: model.busy) {
                        Task {
                            if await model.perform({ try await model.saveProfile(nickname: nickname, companion: companion, color: color) }) { dismiss() }
                        }
                    }.disabled(InputRules.name(companion).isEmpty)
                }
            }
            .navigationTitle(model.profile == nil ? "고양이 이름 짓기" : "캐릭터 설정")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                if model.profile != nil {
                    ToolbarItem(placement: .cancellationAction) { Button("취소") { dismiss() }.disabled(model.busy) }
                }
            }
            .onAppear {
                nickname = model.profile?.nickname ?? ""
                companion = model.profile?.companion ?? ""
                color = model.profile?.color ?? "mint"
            }
            .interactiveDismissDisabled(model.busy)
        }
    }
}
