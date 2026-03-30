export function getMatchLevel(score) {
  const normalized = score > 1 ? score / 100 : score;
  if (normalized >= 0.8) return "High Match";
  if (normalized >= 0.6) return "Moderate Match";
  if (normalized >= 0.4) return "Low Match";
  return "Very Low Match";
}
