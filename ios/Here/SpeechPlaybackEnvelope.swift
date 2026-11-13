import Foundation

/// Bounded per-buffer energy windows, read by the player's sample clock rather
/// than packet arrival. Queued future speech cannot animate the current mouth.
struct SpeechPlaybackEnvelope {
    private struct Window { var end: Int64; var level: Float }
    private var windows: [Window] = []
    private var cursor = 0
    private(set) var level: Float = 0

    mutating func append(_ samples: [Float], startingAt frame: Int64) {
        let window = 480 // 20 ms at 24 kHz
        for start in stride(from: 0, to: samples.count, by: window) {
            let end = min(start + window, samples.count)
            var energy: Float = 0
            for index in start..<end {
                let sample = samples[index].isFinite ? samples[index] : 0
                energy += sample * sample
            }
            let rms = sqrt(energy / Float(end - start))
            windows.append(Window(end: frame + Int64(end), level: min(1, max(0, (rms - 0.008) * 7))))
        }
    }

    mutating func sample(at frame: Int64) -> Float {
        while cursor < windows.count, windows[cursor].end <= frame { cursor += 1 }
        let target = frame >= 0 && cursor < windows.count ? windows[cursor].level : 0
        level += (target - level) * (target > level ? 0.8 : 0.5)
        if level < 0.005 { level = 0 }
        if cursor > 256 { windows.removeFirst(cursor); cursor = 0 }
        return level
    }

    mutating func reset() { windows.removeAll(keepingCapacity: true); cursor = 0; level = 0 }
}
