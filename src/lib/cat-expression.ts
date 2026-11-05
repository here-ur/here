export type CatExpression = "neutral" | "warm" | "gentle";

/** Small visual cues, not an emotion diagnosis. Only explicit user language changes the face.
 * Both completed voice transcripts and chat messages enter the same path. Nothing is stored.
 */
export function catExpression(text: string, safetyNotice = false): CatExpression {
  if (safetyNotice) return "gentle";
  const value = text.trim().toLowerCase();
  if (!value) return "neutral";
  // Distress wins over laughter/positive words used to soften a difficult message.
  if (/힘들|슬프|슬퍼|불안|외롭|외로워|우울|무섭|무서워|속상|지쳤|지친|지쳐|걱정|괴롭|괴로워|죽고|죽을|자해|헤어졌|이별|싸웠|떨어졌|불합격/.test(value)) return "gentle";
  if (/안\s*(좋|기쁘|행복|신나)|기쁘지\s*않|행복하지\s*않|좋지\s*않/.test(value)) return "neutral";
  if (/합격했|붙었어|취업했|성공했|해냈|기뻐|기쁘|행복해|신나|너무\s*좋|정말\s*좋|고마워/.test(value)) return "warm";
  return "neutral";
}
