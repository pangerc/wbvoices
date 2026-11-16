/** AI Match-Review (AAC-255) — public surface. */
export {
  applicableDimensions,
  coerceCriticFindings,
  reviewWithCritic,
  shouldRunCritic,
} from "./critic";
export { reviewDeterministic } from "./deterministic";
export {
  ensureMatchReviewEventsTable,
  isMissingEventsTableError,
  recordImprovementApplied,
  recordMatchReview,
  runMatchReview,
  type MatchReviewContext,
} from "./events";
export type {
  Improvement,
  ImprovementApply,
  MatchDimension,
  MatchFinding,
  MatchSeverity,
  ReviewBrief,
  ReviewResult,
  ReviewVoiceTrack,
} from "./types";
