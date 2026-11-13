import AVFoundation
import OSLog

/// Owns the microphone and playback together so stop always releases both.
@MainActor
final class VoiceAudio {
    private var engine: AVAudioEngine?
    private var player: AVAudioPlayerNode?
    private var tapped = false
    private var observers: [NSObjectProtocol] = []
    private var playbackEpoch = UUID()
    private var audioRun = UUID()
    private var startedAt = Date.distantPast
    private var startupRecoveries = 0
    private var scheduledFrames: Int64 = 0
    private var completedFrames: Int64 = 0
    private var playbackOrigin: Int64?
    private var envelope = SpeechPlaybackEnvelope()
    private var meterTimer: Timer?
    private(set) var pendingBuffers = 0
    var onDrained: (() -> Void)?
    var onLevel: ((Float) -> Void)?

    static func permission() async -> Bool {
        await withCheckedContinuation { continuation in
            AVAudioApplication.requestRecordPermission { continuation.resume(returning: $0) }
        }
    }

    func start(onInput: @escaping @MainActor @Sendable (Data) -> Void, onInterrupted: @escaping @MainActor @Sendable () -> Void) throws {
        stop()
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setPreferredSampleRate(48_000)
        try session.setPreferredIOBufferDuration(0.02)
        try session.setActive(true)
        let engine = AVAudioEngine()
        self.engine = engine
        let input = engine.inputNode
        // Native echo cancellation prevents the assistant's speaker output becoming user input.
        try input.setVoiceProcessingEnabled(true)
        let format = input.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0,
              let pcm = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: VoicePCM.sampleRate, channels: 1, interleaved: true),
              let converter = AVAudioConverter(from: format, to: pcm),
              let playbackFormat = AVAudioFormat(standardFormatWithSampleRate: VoicePCM.sampleRate, channels: 1) else {
            throw APIError(error: "마이크 오디오 형식을 사용할 수 없어요.")
        }
        let player = AVAudioPlayerNode()
        self.player = player
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: playbackFormat)
        input.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in
            let capacity = AVAudioFrameCount(Double(buffer.frameLength) * VoicePCM.sampleRate / format.sampleRate) + 32
            guard let output = AVAudioPCMBuffer(pcmFormat: pcm, frameCapacity: capacity) else { return }
            var supplied = false
            var conversionError: NSError?
            converter.convert(to: output, error: &conversionError) { _, status in
                if supplied { status.pointee = .noDataNow; return nil }
                supplied = true; status.pointee = .haveData; return buffer
            }
            guard conversionError == nil, output.frameLength > 0, let samples = output.int16ChannelData?[0] else { return }
            let data = Data(bytes: samples, count: Int(output.frameLength) * 2)
            Task { @MainActor in onInput(data) }
        }
        tapped = true
        engine.prepare()
        try engine.start()
        player.play()
        // Simulator/Core Audio can settle its hardware format just after start.
        startedAt = Date()
        startupRecoveries = 0
        let run = audioRun
        meterTimer = Timer(timeInterval: 1.0 / 30, repeats: true) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.audioRun == run, self.pendingBuffers > 0 else { return }
                let frame = self.sampleTime() - (self.playbackOrigin ?? self.sampleTime())
                self.onLevel?(self.envelope.sample(at: frame))
            }
        }
        if let meterTimer { RunLoop.main.add(meterTimer, forMode: .common) }
        // Register only after our own category/voice-processing/engine setup is complete.
        observers = [AVAudioSession.interruptionNotification, AVAudioSession.routeChangeNotification,
                     AVAudioSession.mediaServicesWereResetNotification, .AVAudioEngineConfigurationChange].map { name in
            NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
                let interruption = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                Task { @MainActor in
                    guard let self, self.audioRun == run, let engine = self.engine, let player = self.player else { return }
                    if name == .AVAudioEngineConfigurationChange, !engine.isRunning,
                       Date().timeIntervalSince(self.startedAt) < 3, self.startupRecoveries < 2 {
                        self.startupRecoveries += 1
                        do {
                            engine.prepare()
                            try engine.start()
                            player.play()
                            #if DEBUG
                            Logger(subsystem: "com.hereur.here.dev", category: "voice").info("audio_startup_recovered")
                            #endif
                            return
                        } catch { onInterrupted(); return }
                    }
                    guard Self.shouldEnd(name: name, reason: reason, interruption: interruption, engineRunning: engine.isRunning) else { return }
                    #if DEBUG
                    Logger(subsystem: "com.hereur.here.dev", category: "voice").info("audio_interruption event=\(name.rawValue, privacy: .public) reason=\(reason ?? 0, privacy: .public)")
                    #endif
                    onInterrupted()
                }
            }
        }
    }

    nonisolated static func shouldEnd(name: Notification.Name, reason: UInt?, interruption: UInt?, engineRunning: Bool) -> Bool {
        switch name {
        case AVAudioSession.interruptionNotification:
            return interruption == AVAudioSession.InterruptionType.began.rawValue
        case AVAudioSession.routeChangeNotification:
            return reason == AVAudioSession.RouteChangeReason.oldDeviceUnavailable.rawValue
                || reason == AVAudioSession.RouteChangeReason.newDeviceAvailable.rawValue
        case .AVAudioEngineConfigurationChange: return !engineRunning
        case AVAudioSession.mediaServicesWereResetNotification: return true
        default: return false
        }
    }

    func enqueue(_ data: Data) throws {
        guard let player, let values = VoicePCM.decode(data),
              let format = AVAudioFormat(standardFormatWithSampleRate: VoicePCM.sampleRate, channels: 1),
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(values.count)),
              let destination = buffer.floatChannelData?[0] else { throw APIError(error: "음성을 재생하지 못했어요.") }
        // Bound in-memory audio buffering to avoid unbounded latency on slow devices.
        guard scheduledFrames - completedFrames + Int64(values.count) < 24_000 * 120 else {
            throw APIError(error: "음성 재생이 지연됐어요. 다시 연결해 주세요.")
        }
        // Reset the time anchor after an underrun; silent gaps are not heard speech.
        if pendingBuffers == 0 { playbackOrigin = sampleTime() - completedFrames }
        buffer.frameLength = AVAudioFrameCount(values.count)
        values.withUnsafeBufferPointer { destination.update(from: $0.baseAddress!, count: values.count) }
        envelope.append(values, startingAt: scheduledFrames)
        scheduledFrames += Int64(values.count)
        pendingBuffers += 1
        let epoch = playbackEpoch
        player.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
            Task { @MainActor in
                guard let self, self.playbackEpoch == epoch else { return }
                self.completedFrames += Int64(values.count)
                self.pendingBuffers -= 1
                if self.pendingBuffers == 0 { self.envelope.reset(); self.onLevel?(0); self.onDrained?() }
            }
        }
        if !player.isPlaying { player.play() }
    }

    private func sampleTime() -> Int64 {
        guard let player, let render = player.lastRenderTime,
              let time = player.playerTime(forNodeTime: render) else { return 0 }
        return time.sampleTime
    }

    /// Stop queued speech and return only the audio duration actually played.
    @discardableResult func clearPlayback() -> Int {
        let heard = min(scheduledFrames, max(completedFrames, sampleTime() - (playbackOrigin ?? sampleTime())))
        playbackEpoch = UUID()
        player?.stop()
        scheduledFrames = 0; completedFrames = 0; pendingBuffers = 0; playbackOrigin = nil
        if engine?.isRunning == true { player?.play() }
        envelope.reset()
        onLevel?(0)
        return max(0, Int(Double(heard) / VoicePCM.sampleRate * 1000))
    }

    func stop() {
        audioRun = UUID()
        meterTimer?.invalidate(); meterTimer = nil
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = []
        if tapped { engine?.inputNode.removeTap(onBus: 0); tapped = false }
        engine?.stop()
        clearPlayback()
        engine = nil; player = nil
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }
}
