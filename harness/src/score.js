// Generic band evaluator. All thresholds, weights and grade cuts come from the rubric file;
// nothing in here encodes an opinion. Changing the rubric changes the scores without a code edit.

function bandScore(signal, value) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;

  if (signal.direction === 'boolean_false_good' || signal.direction === 'boolean_true_good') {
    const hit = signal.bands.find((b) => b.value === !!value);
    return hit ? hit.score : null;
  }

  let v = value;
  if (signal.direction === 'range') {
    const [lo, hi] = signal.target_range;
    v = v < lo ? (lo - v) / lo : v > hi ? (v - hi) / hi : 0;
  }

  if (signal.direction === 'higher') {
    for (const b of signal.bands) if (v >= b.min) return b.score;
    return signal.bands[signal.bands.length - 1].score;
  }
  // lower, and range-distance
  for (const b of signal.bands) if (b.max === null || b.max === undefined || v <= b.max) return b.score;
  return signal.bands[signal.bands.length - 1].score;
}

// Predicate evaluator shared by grade caps and defect rules. Every operator is total:
// an unmeasured signal never fires a rule, because absence of measurement is not evidence.
const OPS = {
  gte: (v, t) => v >= t,
  gt: (v, t) => v > t,
  lte: (v, t) => v <= t,
  lt: (v, t) => v < t,
  eq: (v, t) => v === t,
  ne: (v, t) => v !== t,
};

function predicate(rule, signals) {
  const v = signals[rule.signal];
  if (v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v))) return false;
  if (rule.op === 'outside') {
    const [lo, hi] = rule.range;
    return v < lo || v > hi;
  }
  const fn = OPS[rule.op];
  if (!fn) throw new Error(`unknown rule op "${rule.op}" in rule ${rule.id}`);
  return fn(v, rule.value);
}

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];

// Caps set a ceiling, never a floor. The lowest ceiling among the ones that fired wins.
function applyCaps(grade, caps) {
  let out = grade;
  for (const c of caps) if (GRADE_ORDER.indexOf(out) < GRADE_ORDER.indexOf(c.max_grade)) out = c.max_grade;
  return out;
}

// Defects are counted, never summed into the score. The count and the grade are independent
// so that a disagreement between them stays visible instead of being averaged away.
function evalDefects(signals, rubric) {
  const spec = rubric.scoring.defects;
  if (!spec) return null;
  const hits = spec.rules.filter((r) => predicate(r, signals));
  return {
    count: hits.length,
    major: hits.filter((h) => h.severity === 'major').length,
    minor: hits.filter((h) => h.severity === 'minor').length,
    rules_evaluated: spec.rules.length,
    // Rules whose signal was never measured, so the count is a floor rather than a total.
    rules_not_evaluable: spec.rules.filter((r) => {
      const v = signals[r.signal];
      return v === null || v === undefined || (typeof v === 'number' && Number.isNaN(v));
    }).map((r) => r.id),
    ids: hits.map((h) => h.id),
    detail: hits.map((h) => ({ id: h.id, dimension: h.dimension, severity: h.severity, signal: h.signal, value: signals[h.signal], label: h.label })),
  };
}

export function scoreServer(signals, rubric) {
  const dimensions = {};
  const signalScores = {};

  for (const dim of rubric.dimensions) {
    const scores = [];
    for (const sig of dim.signals) {
      const s = bandScore(sig, signals[sig.id]);
      signalScores[sig.id] = s;
      if (s !== null) scores.push(s);
    }
    dimensions[dim.id] = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  }

  let wsum = 0, acc = 0;
  for (const dim of rubric.dimensions) {
    if (dimensions[dim.id] === null) continue;
    acc += dimensions[dim.id] * dim.weight;
    wsum += dim.weight;
  }
  const overall = wsum ? acc / wsum : null;

  const hardFails = rubric.scoring.hard_fail_signals.filter((id) => {
    const v = signals[id];
    return v === true || (typeof v === 'number' && v > 0);
  });

  let grade = null;
  let uncapped = null;
  let capsApplied = [];
  if (overall !== null) {
    grade = rubric.scoring.grades.find((g) => overall >= g.min)?.grade ?? 'F';
    if (hardFails.length) {
      if (GRADE_ORDER.indexOf(grade) < GRADE_ORDER.indexOf('D')) grade = 'D';
    }
    uncapped = grade;
    capsApplied = (rubric.scoring.grade_caps || []).filter((c) => predicate(c, signals));
    grade = applyCaps(grade, capsApplied);
  }

  const defects = evalDefects(signals, rubric);

  return {
    dimension_scores: dimensions,
    signal_scores: signalScores,
    overall_score: overall === null ? null : Math.round(overall * 1000) / 1000,
    grade,
    // Present only from rubric 1.1.0 on, so a 1.0.0 score record stays byte-identical.
    ...(rubric.scoring.grade_caps ? {
      uncapped_grade: uncapped,
      caps_applied: capsApplied.map((c) => ({ id: c.id, max_grade: c.max_grade, signal: c.signal, value: signals[c.signal], label: c.label })),
    } : {}),
    ...(defects ? { defects } : {}),
    hard_fails: hardFails,
    measured_weight: Math.round(wsum * 1000) / 1000,
  };
}

// Collision count is a property of the cohort, not of a server in isolation:
// how many of this server's tool names are also exposed by another server in the cohort.
export function cohortCollisions(records) {
  const owners = new Map();
  for (const r of records) {
    for (const n of r.signals?.tool_names || []) {
      if (!owners.has(n)) owners.set(n, new Set());
      owners.get(n).add(r.server.registry_name);
    }
  }
  const out = new Map();
  for (const r of records) {
    let c = 0;
    const examples = [];
    for (const n of r.signals?.tool_names || []) {
      const set = owners.get(n);
      if (set && set.size > 1) { c++; if (examples.length < 5) examples.push(n); }
    }
    out.set(r.server.registry_name, { cohort_collision_count: c, collision_examples: examples });
  }
  return out;
}
