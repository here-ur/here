// 디자인 확인용 가상 프로필. 실제 상담사·자격·후기·예약 정보가 아니다.
export const COUNSELING_TOPICS = ["전체", "마음·감정", "관계", "일·생활"] as const;
export type CounselingTopic = (typeof COUNSELING_TOPICS)[number];

export type Counselor = {
  id: string;
  name: string;
  color: "lavender" | "sky" | "mint";
  topics: Exclude<CounselingTopic, "전체">[];
  tags: string[];
  introduction: string;
  approach: string;
};

export const EXAMPLE_COUNSELORS: Counselor[] = [
  {
    id: "example-seoyeon",
    name: "김서연",
    color: "lavender",
    topics: ["마음·감정", "관계"],
    tags: ["감정 이해", "자기 이해"],
    introduction: "정리되지 않은 마음도\n있는 그대로 이야기해요.",
    approach: "어디서부터 말해야 할지 몰라도 괜찮아요. 요즘 느끼는 감정과 일상의 이야기를 듣고, 내 마음을 이해하는 시간을 함께 가져요.",
  },
  {
    id: "example-doyun",
    name: "이도윤",
    color: "sky",
    topics: ["관계", "일·생활"],
    tags: ["대인 관계", "직장 생활"],
    introduction: "관계 속에서 느낀 마음을\n함께 살펴봐요.",
    approach: "다른 사람과 지내며 어려웠던 순간부터 이야기해요. 관계에서 내가 바라는 것과 편안한 거리감을 함께 생각해 봐요.",
  },
  {
    id: "example-jieun",
    name: "박지은",
    color: "mint",
    topics: ["마음·감정", "일·생활"],
    tags: ["일상 스트레스", "쉼과 균형"],
    introduction: "바쁜 일상 속 내 마음을\n돌아보는 시간을 가져요.",
    approach: "반복되는 일상에서 무엇이 부담이 되는지 차근차근 살펴봐요. 내 속도에 맞는 일상과 휴식에 대해 이야기해요.",
  },
];

export function counselorsForTopic(topic: CounselingTopic) {
  return topic === "전체" ? EXAMPLE_COUNSELORS : EXAMPLE_COUNSELORS.filter((counselor) => counselor.topics.includes(topic));
}
