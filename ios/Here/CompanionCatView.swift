import SwiftUI

/// Facial coordinates are authored against the 1199 × 1312 Cat asset.
/// The body never translates, rotates, or scales with speech.
struct CompanionCatView: View {
    var speechLevel: Float = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var blink: CGFloat = 0

    var body: some View {
        GeometryReader { geometry in
            let scale = geometry.size.width / 1199
            let opening = CGFloat(min(1, max(0, speechLevel)))
            ZStack(alignment: .topLeading) {
                Image("Cat").resizable()
                    .modifier(CatBlinkModifier(blink: blink, size: geometry.size))
                // A small cavity beneath the existing muzzle; no replacement of the face.
                Ellipse()
                    .fill(LinearGradient(colors: [Color(red: 0.025, green: 0.023, blue: 0.031),
                                                  Color(red: 0.09, green: 0.065, blue: 0.08)],
                                         startPoint: .top, endPoint: .bottom))
                    .overlay(alignment: .bottom) {
                        Ellipse().fill(Color(red: 0.26, green: 0.15, blue: 0.19))
                            .frame(width: 27 * scale, height: 9 * opening * scale)
                            .padding(.bottom, 3 * scale)
                    }
                    .frame(width: (48 + 16 * opening) * scale, height: (2 + 49 * opening) * scale)
                    .opacity(Double(min(1, opening * 10)))
                    .position(x: 597 * scale, y: (558 + 24.5 * opening) * scale)
                    .animation(.linear(duration: 1.0 / 30), value: speechLevel)
            }
        }
        .aspectRatio(1199.0 / 1312.0, contentMode: .fit)
        .task(id: scenePhase == .active && !reduceMotion) {
            blink = 0
            guard scenePhase == .active, !reduceMotion else { return }
            do {
                while !Task.isCancelled {
                    try await Task.sleep(for: .seconds(Double.random(in: 2.8...5.5)))
                    withAnimation(.easeIn(duration: 0.10)) { blink = 1 }
                    try await Task.sleep(for: .milliseconds(130))
                    withAnimation(.easeOut(duration: 0.16)) { blink = 0 }
                }
            } catch { blink = 0 }
        }
    }
}

#Preview("Face — resting / speaking") {
    HStack {
        CompanionCatView()
        CompanionCatView(speechLevel: 0.7)
    }.frame(height: 320).padding().background(Color.gray.opacity(0.15))
}

private struct CatBlinkModifier: AnimatableModifier {
    var blink: CGFloat
    var size: CGSize
    var animatableData: CGFloat {
        get { blink }
        set { blink = newValue }
    }
    func body(content: Content) -> some View {
        content.distortionEffect(ShaderLibrary.catBlink(.float2(size), .float(Float(blink))),
                                 maxSampleOffset: CGSize(width: 0, height: 80 * size.width / 1199))
    }
}
