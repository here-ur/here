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

## App-entry checkpoint — stopped at user request

Implementation: `af436e0df7990ea8183bd7dade88ae1d0497fb7b` on
`feature/system-prompt`. Authenticated preparation now overlaps entry checks and
is handed to the matching account/profile. Activation explicitly ends waiting,
requests a live greeting, then continues the conversation. React development
effect replay no longer duplicates the preparation request.

The stricter browser test clicks as soon as the button is hit-testable, without
Playwright's extra animation-stability wait. It also checks request count and
reuses saved browser state in subsequent runs to cover returning users.

| Scenario | Click to first sound, ms | Result |
| --- | --- | --- |
| Local, immediate entry; first fresh, then 2 cached-state entries | 912.1 / 976.8 / 1,108.9 | 3/3 pass |
| Feature preview, immediate entry; first fresh, then 4 cached-state entries | 2,140.6 / 2,162.0 / 2,458.3 / 3,759.7 / 2,511.2 | 0/5 pass |

Preview: `https://here-htjb7cxct-here23.vercel.app`. Each run created one session,
kept GPT-Live 1, Noeul and backend memory enabled, and produced a greeting. No
pre-click speech or microphone access occurred. A separate functional test
received a completed follow-up recalling the stored board-game gathering; it
used an autoplay override and does not count toward latency acceptance.

**The strict 2-second requirement remains unmet.** Work stopped at the user's
request; this candidate was not promoted to the development alias or production.
Unrounded results: [checkpoint JSON](evaluations/voice-greeting-2026-11-21-entry.json).

## Recheck after recharge — 2026-11-21 (KST)

Tested the deployed development app at `https://here-dev.vercel.app`, commit
`0e371f95fc4c555eaed32e54bdb3c54a27b6ba1e` (deployment
`https://here-4yxezbmvc-here23.vercel.app`). This was actual Chrome home-button
interaction with microphone permission already granted, silent synthetic input,
and a fresh browser context per run. No autoplay override was used for these
latency measurements. Only the optional home dwell differed between scenarios.

| Scenario | Click to audible greeting, ms | Result |
| --- | --- | --- |
| Stay on home for 5 seconds; connection ready before click in all 3 runs | 1,307.0 / 1,096.4 / 1,208.5 | 3/3 pass |
| Click as soon as the home voice button is available; connection not ready in all 3 runs | 3,140.5 / no greeting within the 18-second observation window / 4,143.9 | 0/3 pass |

All six session requests returned HTTP 200 and reached `session.started` with
GPT-Live 1, Noeul and backend memory enabled. None accessed the microphone or
generated a transcript before the click. No browser error or user speech was
observed. The earlier provider quota failure did not recur.

The immediate-entry runs took 2,140.2 / 1,539.9 / 2,019.4 ms from the click to
activation of the connected session. Even after connecting, one run produced no
greeting. Connection preparation alone therefore does not establish the required
deadline or reliable greeting delivery for immediate entry. **Overall: FAIL.**

A separate real-provider functional test activated a standby session, spoke a
synthetic question and received a completed answer recalling the saved backend
summary about a board-game gathering. Context requests and delegation succeeded;
no conversation error occurred. This functional harness used an autoplay override
and is explicitly excluded from the latency acceptance results.

Unrounded measurements and the functional result are saved in
[the JSON report](evaluations/voice-greeting-2026-11-21-recharged.json).

## User-requested app-entry preconnection

The original candidate started an authenticated Live session after login, consent,
onboarding and member-basics checks, when the home screen was visible. The latest
checkpoint above starts during entry checks; the server still verifies membership,
consent, quota and backend context before creating a paid provider session. It uses the
same backend context, GPT-Live 1 and Noeul. This consumes a voice-session quota and
can incur provider cost even if the user never enters voice.

- Standby sends synthetic silence, never opens the microphone, mutes output and
  tells the model to wait. No greeting text or recording is prepared for playback.
- Pressing voice claims that session, opens the microphone, refreshes the token
  used for subsequent context requests, and requests a freshly synthesized `안녕!`
  through commentary. It does not add a second greeting to the cold-start path.
- Any speech generated before activation invalidates the standby session. It is
  closed rather than replayed. Unsupported/failed standby can fall back to a new
  connection; authentication, consent and quota denials are not retried.
- Entering text, leaving home, changing profile, hiding/closing the page or
  signing out disposes unused standby. A claimed call owns its cancellation.
- There is no background retry loop. The 2-second timer still starts at the
  actual voice click. A click before standby finishes includes the remaining wait.

Earlier home-button experiments, before recharge, with a five-second home dwell:

| Activation experiment | Click to first sound, ms | Result |
| --- | --- | --- |
| Full spoken instruction | 2,724.2 / 3,645.6 / 2,579.9 | All fail |
| Short start notice plus speakable greeting | app quota denial / 1,380.7 / 2,332.1 | Overall fail |
| Final, greeting commentary only | provider failures | Not latency-validated |

The successful session-creation runs above had no pre-click microphone access or
speech. The final variant's additional runs could not create a session: OpenAI
returned HTTP 429 classified from its error as billing/quota exhaustion. The
application now preserves that status and avoids a duplicate activation retry.
This is distinct from the development account's separate five-per-minute quota.
The post-recharge measurements above supersede that blocked verification state:
follow-up conversation passed, while immediate-entry greeting latency still failed.

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
| Local experiment: speakable greeting cue + parallel authorized microphone setup | 2,743.2 / 1,794.7 / 1,665.7 / 2,581.8 / 2,431.7 | 2/5 pass; overall fail; cue later withdrawn |
| Local experiment: also prepare browser transport on home and overlap audio meter setup | 1,726.4 / 2,432.6 / 2,031.4 / 2,081.5 / 2,215.7 | 1/5 pass; overall fail; cue later withdrawn |

The latest five-run batch kept GPT-Live 1 and Noeul and generated every greeting
live, after the button press. All five requests returned HTTP 200 and a greeting;
none contained user speech or browser errors. The 2,031.4-ms run is a failure.
Transport RTT was 35 ms in the first run and 124–136 ms in the other four;
provider session creation took 193–553 ms. These observations identify variable
connection costs; they do not establish provider geography or a causal speedup.

The extra cold-start `session.commentary.append` greeting cue was subsequently withdrawn.
A hosted follow-up test greeted but produced no answer within 30 seconds after
the synthetic user's question, despite successful context API calls. With that
cue removed, a separate test answered from the saved backend summary. These two
runs do not establish causation, but that duplicate cold-start cue has not passed
conversation regression testing. The original server startup
greeting instruction remains. The local timings above describe the experiment,
not the final retained implementation, and the 2-second requirement remains unmet.

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
  alone therefore did not satisfy the strict criterion either. This was an early
  diagnostic; the subsequent user-requested app-entry candidate is described above.

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
- Prepare the actual authenticated connection on the home screen, using the
  standby lifecycle described above. This replaces the earlier browser-only warmup.
- When microphone permission is already granted, overlap device opening with
  session setup. Unresolved permission still blocks the paid request. Late device
  streams are stopped if the user cancels.
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

`GREETING_PRECONNECT_WAIT_MS=5000` explicitly tests a user who stays on home for
five seconds before clicking. The default is zero extra wait. Report these scenarios
separately; warm results do not prove immediate-entry performance. The script also
fails on speech generation or microphone access before the button press.
It verifies the returned model, voice and memory-enabled flag, spaces run starts
by at least 16 seconds to respect the member quota, and enters text during cleanup
so it does not accidentally open another paid standby session between runs.

## References

- [OpenAI WebRTC WARP: pre-negotiated channels](https://developers.openai.com/api/docs/guides/realtime-webrtc-warp)
- [OpenAI Live session management: greet before the caller speaks](https://developers.openai.com/api/docs/guides/live-conversations#greet-before-the-caller-speaks)

The documented startup greeting instruction improves behavior but does not
provide a maximum time-to-speech guarantee. More testing or a shorter prompt
cannot be represented as a strict provider latency guarantee.
