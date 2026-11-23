/* HereCopy — 온보딩 문구와 규칙. dev의 온보딩 B안(src/lib/onboarding.ts)과 같은 문구다. 화면 문구는 여기서만 가져다 쓴다(지어내지 않는다). */
(() => {
  const Q = {
    lately: { id: "lately", text: "요즘 마음은 어때요?", options: ["그럭저럭 괜찮아요", "조금 지쳤어요", "많이 힘들어요", "잘 모르겠어요"] },
    concern: { id: "concern", text: "요즘 마음이 가장 많이 가는 건 뭐예요?", options: ["일·학업", "사람·관계", "나 자신", "몸·생활", "그냥 이야기하고 싶어요"] },
    want: { id: "want", text: "여기서 어떤 시간이 되면 좋겠어요?", options: ["털어놓고, 들어 주면 좋겠어요", "엉킨 생각을 같이 정리하고 싶어요", "가볍게 이야기 나누고 싶어요", "아직 모르겠어요"] },
    support: { id: "support", text: "힘들 때 이야기할 수 있는 사람이 있어요?", options: ["있어요", "가끔 있어요", "지금은 없어요"] },
  };
  // 답을 고르면 고양이가 한 줄 받아친다(처음 만난 사람을 경계하는 길고양이의 짧은 반말, 사용자를 평가·단정·충고하지 않는다). 앱에서는 src/lib/onboarding.ts 값으로 덮어쓴다.
  const REPLIES = {
    lately: { "그럭저럭 괜찮아요": "그럭저럭이구나. 알았어.", "조금 지쳤어요": "조금 지쳤구나. 그럼 천천히 해.", "많이 힘들어요": "많이 힘들구나. 말해 줘서 고마워.", "잘 모르겠어요": "모를 수도 있지. 그럴 때 있어." },
    concern: { "일·학업": "일이랑 공부. 흠, 계속 말해 봐.", "사람·관계": "사람 사이 일이구나. 그거 복잡하지.", "나 자신": "나에 대한 거. 흠, 궁금하네.", "몸·생활": "몸이랑 생활 쪽이구나. 잠이라면 나도 좀 알지.", "그냥 이야기하고 싶어요": "그냥 이야기? 그것도 괜찮지." },
    want: { "털어놓고, 들어 주면 좋겠어요": "듣는 건 자신 있어. 귀가 크거든.", "엉킨 생각을 같이 정리하고 싶어요": "하나씩 풀어 보자. 답은 네가 정해.", "가볍게 이야기 나누고 싶어요": "가볍게? 그건 나도 좋아.", "아직 모르겠어요": "몰라도 돼. 일단 얘기해 봐." },
    support: { "있어요": "다행이네. 그 사람 얘기도 나중에 해 줘.", "가끔 있어요": "가끔이라도 있으면 든든하지.", "지금은 없어요": "지금은 없구나. 사람한테 꺼낼 말, 여기서 같이 연습해 봐도 돼." },
  };
  const MEET = { "그럭저럭 괜찮아요": "…가자고? 이번만이야.", "조금 지쳤어요": "…천천히 가. 따라갈 테니까.", "많이 힘들어요": "…오늘은 좀 쉬자. 이것만 알아 둬.", "잘 모르겠어요": "…글쎄. 일단 가 볼까." };
  const S_LATELY = { "그럭저럭 괜찮아요": "그럭저럭 괜찮고", "조금 지쳤어요": "조금 지쳐 있고", "많이 힘들어요": "많이 힘들고", "잘 모르겠어요": "마음이 어떤지 잘 모르겠고" };
  const S_CONCERN = { "일·학업": "일이나 공부에 마음이 많이 가 있고", "사람·관계": "사람 사이 일에 마음이 많이 가 있고", "나 자신": "너 자신에 대한 생각이 많고", "몸·생활": "몸이랑 생활 쪽이 신경 쓰이고", "그냥 이야기하고 싶어요": "딱히 뭐가 있다기보다 그냥 얘기하고 싶고" };
  const S_WANT = { "털어놓고, 들어 주면 좋겠어요": "들어 주길 바라는 거지", "엉킨 생각을 같이 정리하고 싶어요": "엉킨 생각을 같이 정리하고 싶은 거지", "가볍게 이야기 나누고 싶어요": "가볍게 얘기하고 싶은 거지", "아직 모르겠어요": "뭘 바라는지는 아직 모르는 거지" };
  const STYLE = { listen: { label: "조용히 들어 주기", tell: "조용히 들어 줄 거래요." }, sort: { label: "같이 정리해 주기", tell: "같이 정리해 줄 거래요." }, chat: { label: "편하게 수다 떨기", tell: "편하게 수다 떨어 줄 거래요." } };

  /** 받침에 따라 조사를 붙인다: josa("지우","은","는") → "지우는" */
  const josa = (w, withFinal, without) => { const c = w.charCodeAt(w.length - 1); if (c < 0xAC00 || c > 0xD7A3) return w + without; return w + ((c - 0xAC00) % 28 ? withFinal : without); };
  /** "(으)로": 받침이 없거나 ㄹ 받침이면 "로", 아니면 "으로" */
  const ro = (w) => { const c = w.charCodeAt(w.length - 1); if (c < 0xAC00 || c > 0xD7A3) return w + "로"; const f = (c - 0xAC00) % 28; return w + (f === 0 || f === 8 ? "로" : "으로"); };
  /** 이름에 쓸 수 있는 글자만 남긴다(글자·숫자·띄어쓰기, 12자). 비면 다음으로 못 넘어간다. */
  const cleanName = (v, max = 12) => String(v).normalize("NFC").replace(/[^\p{L}\p{M}\p{N} ]/gu, "").replace(/\s+/g, " ").trim().slice(0, max);
  const matchStyle = (a) => a.want === "엉킨 생각을 같이 정리하고 싶어요" ? "sort" : (a.want === "가볍게 이야기 나누고 싶어요" && a.lately !== "많이 힘들어요") ? "chat" : "listen";

  window.HereCopy = {
    Q, REPLIES, MEET, STYLE, josa, ro, cleanName, matchStyle,
    TOUGH: "많이 힘들어요",                     // 이 답을 고르면 그 자리에서 109 안내를 보여 준다
    open: {
      eyebrow: "골목 끝에 누가 웅크리고 있어요",
      catLine: "…뭐야. 나 AI야. 사람 아니고.",    // 예전 첫마디(비교용 시안들이 그대로 쓴다)
      desc: "이야기하기 전에 알아 두세요.",
      // 1번 톤 첫 문구: 인사하며 뭘 하러 왔는지 묻고, 버튼이 내 대답이 된다. AI라는 것은 아래 note가 알린다(2026-11-23)
      line: "누구야? 얘기하러 왔어?",
      note: "사람이 아니라 AI와 이야기하게 돼요.",
      approach: "다가가기",
      cta: "이야기하러 왔어요",
    },
    promise: [
      { title: "이 고양이는 AI예요", desc: "들어 주는 건 해요. 진단과 치료는 사람 전문가가 해요." },
      { title: "개인정보 수집·이용", desc: "대화는 30일 동안 내 계정에 두고, 정리한 기억은 그 뒤에도 남아요. 답변은 외부 AI 서비스가 만들어요.", consent: true },
      { title: "민감정보 처리", desc: "대화 속 마음·건강 이야기가 대화 기록과 기억에 담길 수 있어요.", consent: true },
    ],
    consent: { title: "대화를 시작하려면 두 가지 동의가 필요해요", all: "모두 동의해요", required: "필수", cta: "동의하고 시작하기", leave: "동의하지 않고 나가기", note: "동의하지 않으면 대화를 시작할 수 없어요 · 만 14세 이상부터 쓸 수 있어요" },
    sos: { title: "위급할 때는 109", sub: "24시간 사람과 이야기할 수 있어요", tough: "지금 이야기하고 싶다면 109", note: "위험한 말이 나오면 답보다 109 안내를 먼저 보여 줘요" },
    name: { title: "뭐라고 부르면 될까요?", desc: "고양이가 이 이름으로 불러요. 별명이어도 괜찮아요.", label: "이름이나 별명", placeholder: "이름", reply: (n) => `${n}. 흠, 알았어.` },
    about: { birth: (n) => `${n ? josa(n, "이", "") + "의" : "내"} 생일은 언제예요?`, why: "만 14세 이상부터 쓸 수 있어요 · AI 대화에는 보내지 않아요", gender: "성별도 알려 줄래요?", genders: ["여성", "남성"], genderWhy: "내 계정에만 저장하고, AI 대화에는 보내지 않아요",
      birthLabel: "생년월일", units: { y: "년", m: "월", d: "일" }, format: (y, m, d) => `${y}년 ${m}월 ${d}일`, next: "다음",
      under14: { title: "만 14세 이상부터 쓸 수 있어요", desc: "적어 준 생년월일은 저장하지 않았어요.", leave: "로그아웃" },
      /** 만 나이(오늘 기준). 2월 29일생은 평년에 2월 28일로 본다. */
      age(y, m, d, now = new Date()) { let a = now.getFullYear() - y; const mm = now.getMonth() + 1, dd = now.getDate(); const bd = (m === 2 && d === 29 && !(now.getFullYear() % 4 === 0 && (now.getFullYear() % 100 !== 0 || now.getFullYear() % 400 === 0))) ? 28 : d; if (mm < m || (mm === m && dd < bd)) a--; return a; },
    },
    eyebrows: { lately: "나무 뒤에서 누가 보고 있어요", concern: "슬쩍 고개를 내밀어요", want: "대답할 때마다 한 발짝씩", support: "어느새 바로 옆에 앉았어요" },
    meet: { eyebrow: "골목에서 처음 만난 고양이", line: (a) => MEET[a.lately] || "…가자고? 이번만이야.", hold: "꾹 눌러서 데려가기", hint: "꾹 누르면 다가와요", fix: "답 고치기", heard: "들은 것", yes: "맞아요", no: "조금 달라요", toughDesc: "많이 힘든 날엔 사람과 바로 이야기할 수도 있어요." },
    /** 고양이가 들은 것을 되짚는 말. */
    summary(nickname, a) {
      const parts = [a.lately && S_LATELY[a.lately], a.concern && S_CONCERN[a.concern]].filter(Boolean);
      const want = a.want && S_WANT[a.want];
      const who = nickname ? josa(nickname, "은", "는") + " " : "";
      const heard = [parts.length ? "요즘 " + parts.join(", ") : "", want ? "여기선 " + want : ""].filter(Boolean).join(", ");
      return (heard ? who + heard + ". " : "") + "맞게 들었지? 아니면 다시 말해 줘.";
    },
    naming: { label: "고양이 이름", placeholder: "이름을 지어 주세요", defaultName: "호야", names: ["호야", "까미", "먹물", "밤이", "콩떡", "후추", "숯", "모카"], line: (n) => n ? `${n}? 흠. 나쁘지 않네.` : "내 이름? 없어. 네가 지어 봐.", cta: (n) => n ? `${ro(n)} 할게요` : "이름을 지어 주세요", purr: "골골" },
    done: { title: "준비됐어요", cta: "대화 시작하기" },
  };
})();
