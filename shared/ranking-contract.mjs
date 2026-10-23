/*
 * Viral Scanner V6.2.5 YouTube ranking contract.
 *
 * This module owns the meaning of YouTube performance states. Semantic
 * relevance and eligibility are supplied by callers; TOP_PICK remains an
 * output-composition concern and is intentionally not returned here.
 */

export const YOUTUBE_RANKING_DEFAULTS = Object.freeze({
  min_views: 50_000,
  rising_min_views: 10_000,
  rising_min_views_per_hour: 1_000,
  emerging: Object.freeze({
    high_min_views: 500,
    high_min_views_per_hour: 100,
    medium_min_views: 1_000,
    medium_min_views_per_hour: 200,
  }),
  watchlist: Object.freeze({
    high_min_views: 500,
    medium_min_views: 750,
  }),
});

function finite(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeYouTubeRankingConfig(config = {}) {
  const d = YOUTUBE_RANKING_DEFAULTS;
  return {
    ...config,
    min_views: finite(config.min_views, d.min_views),
    rising_min_views: finite(config.rising_min_views, d.rising_min_views),
    rising_min_views_per_hour: finite(config.rising_min_views_per_hour, d.rising_min_views_per_hour),
    emerging: {
      ...(config.emerging || {}),
      high_min_views: finite(config.emerging?.high_min_views, d.emerging.high_min_views),
      high_min_views_per_hour: finite(config.emerging?.high_min_views_per_hour, d.emerging.high_min_views_per_hour),
      medium_min_views: finite(config.emerging?.medium_min_views, d.emerging.medium_min_views),
      medium_min_views_per_hour: finite(config.emerging?.medium_min_views_per_hour, d.emerging.medium_min_views_per_hour),
    },
    watchlist: {
      ...(config.watchlist || {}),
      high_min_views: finite(config.watchlist?.high_min_views, d.watchlist.high_min_views),
      medium_min_views: finite(config.watchlist?.medium_min_views, d.watchlist.medium_min_views),
    },
  };
}

export function classifyYouTubePopularity({ views, velocityPerHour, relevance, eligibility = true, config = {} } = {}) {
  const c = normalizeYouTubeRankingConfig(config);
  const v = views == null || views === '' ? NaN : Number(views);
  const velocity = velocityPerHour == null || velocityPerHour === '' ? NaN : Number(velocityPerHour);
  const hasViews = Number.isFinite(v);
  const hasVelocity = Number.isFinite(velocity);
  const topical = relevance === 'HIGH' || relevance === 'MEDIUM';

  if (!eligibility || !topical) {
    return { status:'NONE', rankBand:99, reason:'', popularityRuleMatched:false, viralRuleMatched:false };
  }

  const absoluteViral = hasViews && v >= c.min_views;
  const velocityViral = hasViews && hasVelocity && v >= c.rising_min_views && velocity >= c.rising_min_views_per_hour;
  if (absoluteViral || velocityViral) {
    let reason;
    if (absoluteViral && velocityViral) reason = `>= ${c.min_views} views + sterke snelheid/uur`;
    else if (absoluteViral) reason = `>= ${c.min_views} views`;
    else reason = `>= ${c.rising_min_views} views + >= ${c.rising_min_views_per_hour} snelheid/uur`;
    return { status:'VIRAL', rankBand:relevance === 'HIGH' ? 1 : 2, reason, popularityRuleMatched:true, viralRuleMatched:true };
  }

  const rising = relevance === 'HIGH'
    ? hasViews && hasVelocity && v >= c.emerging.high_min_views && velocity >= c.emerging.high_min_views_per_hour
    : hasViews && hasVelocity && v >= c.emerging.medium_min_views && velocity >= c.emerging.medium_min_views_per_hour;
  if (rising) {
    const minViews = relevance === 'HIGH' ? c.emerging.high_min_views : c.emerging.medium_min_views;
    const minVph = relevance === 'HIGH' ? c.emerging.high_min_views_per_hour : c.emerging.medium_min_views_per_hour;
    return { status:'RISING', rankBand:relevance === 'HIGH' ? 3 : 4, reason:`${relevance} + >= ${minViews} views + >= ${minVph} snelheid/uur`, popularityRuleMatched:true, viralRuleMatched:false };
  }

  const watchMin = relevance === 'HIGH' ? c.watchlist.high_min_views : c.watchlist.medium_min_views;
  if (hasViews && v >= watchMin) {
    return { status:'WATCHLIST', rankBand:relevance === 'HIGH' ? 5 : 6, reason:`relevant maar VIRAL/RISING drempel niet gehaald; watchlist >= ${watchMin} views`, popularityRuleMatched:false, viralRuleMatched:false };
  }

  return { status:'NONE', rankBand:99, reason:'', popularityRuleMatched:false, viralRuleMatched:false };
}

function candidateValues(...values) {
  const set = new Set([0]);
  for (const raw of values) {
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    set.add(Math.max(0, n - 1));
    set.add(Math.max(0, n));
    set.add(Math.max(0, n + 1));
  }
  return [...set].sort((a,b)=>a-b);
}

export function validateYoutubeRankingConfig(config = {}) {
  const c = normalizeYouTubeRankingConfig(config);
  const errors = [];
  const numericPaths = [
    ['min_views', c.min_views],
    ['rising_min_views', c.rising_min_views],
    ['rising_min_views_per_hour', c.rising_min_views_per_hour],
    ['emerging.high_min_views', c.emerging.high_min_views],
    ['emerging.high_min_views_per_hour', c.emerging.high_min_views_per_hour],
    ['emerging.medium_min_views', c.emerging.medium_min_views],
    ['emerging.medium_min_views_per_hour', c.emerging.medium_min_views_per_hour],
    ['watchlist.high_min_views', c.watchlist.high_min_views],
    ['watchlist.medium_min_views', c.watchlist.medium_min_views],
  ];
  for (const [name, value] of numericPaths) if (!Number.isFinite(value) || value < 0) errors.push(`${name} moet een niet-negatief getal zijn`);
  if (errors.length) return errors;

  const views = candidateValues(c.min_views, c.rising_min_views, c.emerging.high_min_views, c.emerging.medium_min_views, c.watchlist.high_min_views, c.watchlist.medium_min_views);
  const velocities = candidateValues(c.rising_min_views_per_hour, c.emerging.high_min_views_per_hour, c.emerging.medium_min_views_per_hour);
  for (const relevance of ['HIGH','MEDIUM']) {
    const statuses = new Set();
    for (const v of views) for (const velocity of velocities) statuses.add(classifyYouTubePopularity({views:v,velocityPerHour:velocity,relevance,eligibility:true,config:c}).status);
    if (!statuses.has('RISING')) errors.push(`RISING is logisch onbereikbaar voor ${relevance}`);
    if (!statuses.has('WATCHLIST')) errors.push(`WATCHLIST is logisch onbereikbaar voor ${relevance}`);
  }
  return errors;
}
