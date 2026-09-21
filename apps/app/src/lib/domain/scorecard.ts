export type WeightedCriterion = {
  id: string;
  weight: number;
};

export type CriterionRatingValue = {
  criterionId: string;
  rating: number;
};

/**
 * Calculate the score frozen onto a submitted scorecard.
 *
 * Ratings are keyed before calculation so duplicate input cannot add weight or
 * inflate the result. Unknown criterion ids are ignored, and a non-positive
 * legacy weight falls back to 1 just as the original inline calculation did.
 */
export function calculateWeightedScore(
  criteria: WeightedCriterion[],
  ratings: CriterionRatingValue[],
) {
  const ratingByCriterion = new Map(
    ratings.map((rating) => [rating.criterionId, rating.rating]),
  );
  let weightedTotal = 0;
  let totalWeight = 0;

  for (const criterion of criteria) {
    const rating = ratingByCriterion.get(criterion.id);
    if (rating === undefined) continue;

    const weight = criterion.weight > 0 ? criterion.weight : 1;
    weightedTotal += rating * weight;
    totalWeight += weight;
  }

  return totalWeight === 0
    ? null
    : Math.round((weightedTotal / totalWeight) * 100) / 100;
}
