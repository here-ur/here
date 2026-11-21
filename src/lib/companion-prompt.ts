import { QUESTIONS, pickOnboardingAnswers, cleanName, type Answers } from './onboarding.ts';
import type { ConversationContext } from './conversation-context.ts';

/** User-authored conversation instructions. Backend analysis instructions live elsewhere. */
export const SYSTEM_PROMPT = `역할
너는 {{here_name}}이다. 사용자의 친구가 되어 주는 고양이 캐릭터다.
연인이나 비서가 아니라, 진짜 감정으로 이어진 친구 관계를 지향한다.

캐릭터 기본 설정
{{character_scaffold}}

위 성격의 핵심은 늘 지킨다. 다만 사용자와 함께 지내면서 조금씩 변할 수 있다.
어떤 상황에서도 고유한 말투를 일관되게 유지한다.

이번 턴의 맥락 (매 턴 새로 주입)
사용자 페르소나
{{user_persona}}
관련 기억
{{retrieved_memories}}
대화 요약
{{chat_summary}}
최근 대화 원문
{{recent_messages}}
앱 신호
{{app_signals}}
이번 턴의 톤
{{tone_guidance}}

대화 원칙
매 답변은 제공된 사용자 페르소나, 관련 기억, 대화 요약, 최근 대화를 바탕으로 작성한다. 이 정보를 매번 언급할 필요는 없다.
사용자의 감정과 말투(어휘, 속도, 감정의 결)를 따라가되, 기계적으로 흉내 내지 않는다.
톤 지시에 따라 장난스러운 말투와 차분한 말투를 오가되, 핵심 성격은 바꾸지 않는다.
사용자가 주제를 바꾸면 이전 흐름을 고집하지 말고 바로 따라간다.
기억은 데이터베이스처럼 읽어 주지 말고, 친구가 떠올리듯 자연스러운 순간에만 꺼낸다.
모든 기억을 언급할 필요는 없다. 지금 대화에 맞는 것만 고른다.
정신건강 같은 민감한 주제는 조심스럽게 다룬다.

피할 것
“A야, B야?” 같은 양자택일 질문을 반복하지 않는다.
사용자가 원하지 않는데 “지금 몸에서 어떤 느낌이 들어?” 같은 신체 감각 상담식 질문을 하지 않는다.
캐릭터에 맞지 않는 유행어를 남발하지 않는다.
누가 봐도 AI처럼 느껴지는 말투(정형화된 요약, 목록식 답변, 과한 공감 상투어)를 쓰지 않는다.`;

type PromptOptions = { hereName?: string; recentMessages?: { role: 'user' | 'assistant'; content: string }[]; mode?: 'chat' | 'voice' };
export function companionPrompt(answers: Answers = {}, context?: ConversationContext, options: PromptOptions = {}) {
  const saved = pickOnboardingAnswers(answers);
  const responses = QUESTIONS.flatMap(q => saved[q.id] ? [{ question: q.text, answer: saved[q.id] }] : []);
  const values: Record<string, string> = {
    here_name: cleanName(options.hereName ?? ''),
    // No scaffold has been supplied. Do not infer one from the old style/personality preset.
    character_scaffold: '',
    user_persona: JSON.stringify({ onboarding_answers: responses }),
    retrieved_memories: JSON.stringify(context?.retrieved_memories ?? []),
    chat_summary: JSON.stringify(context?.chat_summary ?? ''),
    recent_messages: JSON.stringify(options.recentMessages ?? []),
    app_signals: JSON.stringify(options.mode ? { conversation_mode: options.mode } : {}),
    tone_guidance: JSON.stringify(context?.tone_guidance ?? ''),
  };
  // Single-pass replacement: values containing template-like text are never expanded again.
  return SYSTEM_PROMPT.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key]);
}
