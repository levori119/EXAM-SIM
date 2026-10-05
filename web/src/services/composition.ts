import { db, type Distribution, type Question, type SetQuota } from '../db/db';

/** Editable state of a questionnaire mix, shared by the exam builder and the practice setup. */
export interface MixValue {
  setIds: string[];
  distribution: Distribution;
  /** Requested total for 'equal' / 'proportional'. */
  total: number;
  /** Per-questionnaire counts for 'custom'. */
  custom: Record<string, number>;
}

export const DISTRIBUTION_LABELS: Record<Distribution, string> = {
  equal: 'שווה',
  proportional: 'יחסי לגודל',
  custom: 'ידני',
};

export const DISTRIBUTION_HINTS: Record<Distribution, string> = {
  equal: 'אותו מספר שאלות מכל שאלון',
  proportional: 'שאלון גדול יותר תורם יותר שאלות',
  custom: 'קובעים כמה שאלות מכל שאלון',
};

const answerable = (q: Question) => q.correctIndex !== null && q.options.length >= 2;

/** questionnaire id → number of questions with a confirmed answer. */
export async function answerableCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  await db.questions.each((q) => {
    if (answerable(q)) counts.set(q.setId, (counts.get(q.setId) ?? 0) + 1);
  });
  return counts;
}

/**
 * Splits `total` across questionnaires by weight without exceeding what each has.
 * Overflow from a capped questionnaire is redistributed to the others.
 */
function allocate(ids: string[], weights: number[], caps: number[], total: number): number[] {
  const result = ids.map(() => 0);
  let remaining = Math.min(total, caps.reduce((a, b) => a + b, 0));
  let active = ids.map((_, i) => i).filter((i) => caps[i] > 0 && weights[i] > 0);

  // Cap whoever can't fill their share, repeat until shares fit.
  for (;;) {
    const weightSum = active.reduce((s, i) => s + weights[i], 0);
    const capped = active.filter((i) => (remaining * weights[i]) / weightSum >= caps[i]);
    if (!capped.length) break;
    for (const i of capped) {
      result[i] = caps[i];
      remaining -= caps[i];
    }
    active = active.filter((i) => !capped.includes(i));
    if (!active.length) return result;
  }

  const weightSum = active.reduce((s, i) => s + weights[i], 0);
  const exact = active.map((i) => (remaining * weights[i]) / weightSum);
  active.forEach((i, k) => (result[i] = Math.floor(exact[k])));
  let leftover = remaining - active.reduce((s, i) => s + result[i], 0);
  // Largest remainder first.
  const order = active.map((i, k) => ({ i, frac: exact[k] - Math.floor(exact[k]) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (leftover <= 0) break;
    if (result[i] < caps[i]) {
      result[i]++;
      leftover--;
    }
  }
  return result;
}

export function computeQuotas(mix: MixValue, available: Map<string, number>): SetQuota[] {
  const ids = mix.setIds;
  const caps = ids.map((id) => available.get(id) ?? 0);
  let counts: number[];
  if (mix.distribution === 'custom') {
    counts = ids.map((id, i) => Math.max(0, Math.min(caps[i], Math.floor(mix.custom[id] ?? 0))));
  } else {
    const weights = mix.distribution === 'equal' ? ids.map(() => 1) : caps;
    counts = allocate(ids, weights, caps, Math.max(0, Math.floor(mix.total)));
  }
  return ids.map((setId, i) => ({ setId, count: counts[i] }));
}

export const quotaTotal = (quotas: SetQuota[]) => quotas.reduce((s, q) => s + q.count, 0);

export function mixFromComposition(composition: SetQuota[], distribution: Distribution, total: number): MixValue {
  return {
    setIds: composition.map((c) => c.setId),
    distribution,
    total,
    custom: Object.fromEntries(composition.map((c) => [c.setId, c.count])),
  };
}

/** Draws random answerable questions per quota; questionnaire order is kept, shuffling is up to the caller. */
export async function pickQuestions(quotas: SetQuota[]): Promise<Question[]> {
  const picked: Question[] = [];
  for (const { setId, count } of quotas) {
    if (count <= 0) continue;
    const pool = (await db.questions.where('setId').equals(setId).sortBy('createdAt')).filter(answerable);
    const chosen = new Set(
      pool
        .map((q) => ({ q, r: Math.random() }))
        .sort((a, b) => a.r - b.r)
        .slice(0, count)
        .map((x) => x.q.id),
    );
    picked.push(...pool.filter((q) => chosen.has(q.id)));
  }
  return picked;
}
