# First voice greeting latency

## Acceptance status: FAIL — 2,000 ms not achieved

The user requires a freshly generated model greeting on every voice-button press.
A prepared recording is not an acceptable substitute. No recording/prepared-audio
path is included in the implementation.

The deadline starts at the actual voice button's DOM event timestamp, before
permission checks, authentication, microphone acquisition, or connection setup.
It ends when the browser plays measurable assistant speech. HTTP success,
`session.started`, and transcript arrival are not a latency pass. Compare the raw
floating-point elapsed time: 2,000 ms passes; 2,000.001 ms and 2,100 ms fail.
Every run must pass independently; averages do not determine acceptance.

## Findings (2026-11-21)

Chrome with microphone permission already granted, a silent synthetic microphone,
and a disposable development account. Fresh browser context for each UI run.
No network throttling. Times below are rounded only for display.

| Experiment | First audible greeting, ms | Result |
| --- | --- | --- |
| Existing development deployment, actual home button | 4,151.0 / 4,244.0 / 3,694.9 | All fail |
| Local candidate: negotiated channel + no ICE-gathering wait | 2,611.4 / 2,481.6 / 3,664.4 | All fail |
| Exact short real-time greeting instruction (experiment reverted) | 3,193.5 / 5,165.4 / 18,865.2 | All fail |
| Send microphone RTP earlier (experiment reverted) | 3,660.1 / 3,580.4 / 3,525.9 | All fail |
| Feature preview with negotiated channel + no ICE wait | 5,344.1 / no greeting / 3,965.0 / 3,414.8 / 4,030.4 | All fail |
| Local: speakable greeting cue + parallel authorized microphone setup | 2,743.2 / 1,794.7 / 1,665.7 / 2,581.8 / 2,431.7 | 2/5 pass; overall fail |
| Local: also prepare browser transport on home and overlap audio meter setup | 1,726.4 / 2,432.6 / 2,031.4 / 2,081.5 / 2,215.7 | 1/5 pass; overall fail |

The latest five-run batch kept GPT-Live 1 and Noeul and generated every greeting
live, after the button press. All five requests returned HTTP 200 and a greeting;
none contained user speech or browser errors. The 2,031.4-ms run is a failure.
Transport RTT was 35 ms in the first run and 124–136 ms in the other four;
provider session creation took 193–553 ms. These observations identify variable
connection costs; they do not establish provider geography or a causal speedup.

The existing deployment's authentication, consent and startup-context/quota
checks took roughly 140–153 ms in these runs. They were not the dominant delay.
The local candidate still took 1,338–1,998 ms between `session.started` and actual
speech, in addition to connecting. Removing the database checks would not by
itself solve the deadline, and those checks remain required.

Additional **diagnostic-only** runs (not acceptance tests):

- Calling the provider directly with a synthetic account's context, excluding
  the application's authorization/database round trips, still missed 2 seconds.
  GPT-Live 1.1 also missed the deadline in all three comparison runs. The app's
  configured model remains GPT-Live 1.
- A session already connected and waiting silently, then instructed to generate
  its greeting at a button press, took 2,680.3 / 1,577.8 / 3,163.9 ms. Preconnecting
  alone therefore did not satisfy the strict criterion either. It was not added
  to the application; the app still creates paid voice sessions on user request.

The local and hosted runs are different environments, so these results do not
establish a percentage improvement. Provider generation and transport variance
remain unresolved. Do not label this change “under 2 seconds” or “fixed.”

## Retained changes

- Negotiate the WebRTC event channel in advance (`negotiated: true`, ID 4), and
  pass the same `dcid` through the server. Older clients omitting it still work.
- Send the SDP offer while browser ICE gathering continues; the server's answer
  supplies reachable candidates. Do not wait for all local candidates first.
- Propagate the original button timestamp through the existing permission and
  authentication flow into voice diagnostics.
- Record the unrounded first-audio latency and an explicit 2,000-ms pass/fail.
- Add a repeatable, opt-in browser acceptance test that exits nonzero if any run
  exceeds the deadline, never greets, has an API/browser error, or contains user
  speech that could have triggered the response.
- Prepare a browser peer, transceiver and negotiated channel on the home screen.
  This makes no paid request, opens no microphone and generates no greeting.
  Generate the SDP offer only when the user starts voice; release unused peers.
- When microphone permission is already granted, overlap device opening with
  session setup. Unresolved permission still blocks the paid request. Late device
  streams are stopped if the user cancels.
- Send `session.commentary.append` with the greeting text `안녕!` once at
  `session.started`, keeping the existing server startup instruction. The same
  GPT-Live 1 session synthesizes it with Noeul; there is no stored audio.
- Initialize the playback meter while the session request is in flight, and log
  peer, permission, offer and player stages separately. The benchmark also records
  WebRTC RTT, jitter and packet loss without recording the client's address.

Onboarding/backend context, model, voice, access checks and context synchronization
are unchanged by latency work. A separate user-requested shared-prompt change
prohibits cat speech endings (`냥`, `야옹`) in both text and voice.

## Repeat the acceptance test

Use a disposable Supabase account with an `@example.invalid` email, completed
onboarding and required consent. Supply a private, ignored JSON file containing
`{ "session": <full Supabase session> }`. Never commit it or use a real account.
Install Chrome, then run from the repository root:

```sh
GREETING_SESSION_FILE=.vercel/deployment-test-account.json \
GREETING_TARGET=https://here-dev.vercel.app \
GREETING_RUNS=5 \
GREETING_RESULT=/tmp/here-voice-greeting-result.json \
npm run test:voice-greeting -- --live
```

Without `--live` the script makes no requests. Live runs create billable sessions
and synthetic conversation history. It uses the real home button and APIs,
pregrants the browser's microphone permission, and feeds only generated silence.
Delete the disposable account and session file after testing. Initial human
permission-dialog time is not covered by this scenario; the application's clock
still includes it if the user is prompted.

## References

- [OpenAI WebRTC WARP: pre-negotiated channels](https://developers.openai.com/api/docs/guides/realtime-webrtc-warp)
- [OpenAI Live session management: greet before the caller speaks](https://developers.openai.com/api/docs/guides/live-conversations#greet-before-the-caller-speaks)

The documented startup greeting instruction improves behavior but does not
provide a maximum time-to-speech guarantee. More testing or a shorter prompt
cannot be represented as a strict provider latency guarantee.
