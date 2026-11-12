import SwiftUI

@main
struct HereApp: App {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .tint(Palette.ink)
                .preferredColorScheme(.light)
                .task { await model.restore() }
                .onChange(of: scenePhase) { _, phase in
                    if phase == .active { Task { await model.refreshIfNeeded() } }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject var model: AppModel
    var body: some View {
        Group {
            switch model.gate {
            case .loading: ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .login: LoginView()
            case .invite: InviteView()
            case .consent: ConsentView()
            case .profile: ProfileView()
            case .home: HomeView()
            case .retry, .configuration:
                ContentUnavailableView {
                    Label("잠깐, 연결을 확인할게요", systemImage: "wifi.exclamationmark")
                } description: {
                    Text(model.error)
                } actions: {
                    Button("다시 시도") { Task { await model.restore() } }
                    if model.gate == .retry {
                        Button("로그아웃", role: .destructive) { Task { await model.signOut() } }
                    }
                    #if DEBUG
                    Button("화면 미리보기") { model.startPreview() }
                    #endif
                }
            }
        }
        .background(Palette.background.ignoresSafeArea())
    }
}
