/**
 * How long a candidate has sat on their current stage, and whether that is
 * healthy. Pure so the thresholds can be reasoned about and tested directly
 * rather than inferred from a rendered colour.
 */
export type PaceLevel = "green" | "amber" | "red";

export type Pace = {
  /** Whole days elapsed since entering the current stage. */
  days: number;
  level: PaceLevel;
  label: string;
};

/**
 * green  under 2 days
 * amber  2 to 5 days inclusive
 * red    over 5 days
 */
export const PACE_THRESHOLDS = { amberFrom: 2, redFrom: 6 } as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function daysInStage(enteredAt: Date | null, now: Date = new Date()) {
  if (!enteredAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - enteredAt.getTime()) / MS_PER_DAY));
}

export function paceLevel(days: number): PaceLevel {
  if (days < PACE_THRESHOLDS.amberFrom) return "green";
  if (days < PACE_THRESHOLDS.redFrom) return "amber";
  return "red";
}

export function paceFor(enteredAt: Date | null, now: Date = new Date()): Pace {
  const days = daysInStage(enteredAt, now);
  return {
    days,
    level: paceLevel(days),
    label:
      days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`,
  };
}

export const PACE_DESCRIPTIONS: Record<PaceLevel, string> = {
  green: "Moving at pace",
  amber: "Slowing down",
  red: "Stalled",
};
