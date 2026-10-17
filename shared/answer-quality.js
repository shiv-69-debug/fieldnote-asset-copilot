export function answerQualityIssue(summary) {
  if (typeof summary !== 'string' || !summary.trim()) return 'The model returned no answer text.';
  if (summary.length > 6000) return 'The model returned an excessively long answer instead of a concise explanation.';
  if (/([^\p{L}\p{N}\s])\1{79,}/u.test(summary)) return 'The model returned malformed, repetitive symbols.';
  if (/\b([\p{L}\p{N}]{2,})(?:\s+\1){24,}\b/iu.test(summary)) return 'The model returned a repetitive word sequence.';
  return null;
}

export function validateGroundedAnswer(result, allowedIds) {
  const issue = answerQualityIssue(result?.summary);
  if (issue) { const error = new Error(issue); error.name = 'AnswerQualityError'; throw error; }
  const allowed = new Set(allowedIds);
  if (!Array.isArray(result.source_ids) || !result.source_ids.length || result.source_ids.some(id => !allowed.has(id))) {
    throw new Error('Model produced an answer without valid source citations.');
  }
  return result;
}
