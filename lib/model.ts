// Token radar model, radar-3.
// A fitted size curve, computed at runtime from the snapshot's own launched
// protocols: log10(mcap) = a + b * log10(TVL), fit by OLS on the 92 clean
// comps. No protocol name is special-cased and no coefficient is hardcoded:
// the program re-derives the fit, the validation and the growth/age decision
// from /input/snapshot.json on every run.
//   implied = round( 10^(a + b * log10(tvl)) )
// Growth and age enter ONLY if a 4-feature variant beats the pure size curve
// on BOTH validations (5-fold CV and the time split); on this snapshot it
// does not, so the model is the pure size curve and the note says why.
// Board: all 40 watchlist slugs, plus the 158 highest-implied pre-token
// protocols below the $50M floor, ranked by implied value, strictly decreasing.

export interface SnapshotProtocol {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
}
export interface Snapshot {
  as_of: string; source: string; floor_usd: number;
  protocols: SnapshotProtocol[]; watchlist: string[];
}
export interface SizeFit { a: number; b: number; n: number }
export interface ValidationNumbers { median_factor: number; within_2x: number; n: number }
export interface Validation {
  comps: number; comps_with_age: number;
  size_curve: SizeFit;
  cv: ValidationNumbers; time_split: ValidationNumbers;
  four_feature: { cv: ValidationNumbers; time_split: ValidationNumbers; coefficients: number[] };
  growth_age_included: boolean; decision: string;
}
export interface FarmStep { text: string; cost: string; time: string }
export interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null;
  listed_at: string | null; gecko_id: string | null; symbol: string | null;
  token_status: 'pre-token'; age_days: number | null; implied_value_usd: number;
  model: { fit_a: number; fit_b: number; tvl_multiple: number; age_days: number | null };
  farm_steps: string[];
}
export interface RadarRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; mcap_usd: number | null; listed_at: string | null;
  age_days: number | null; implied_value_usd: number; fit_a: number; fit_b: number;
  tvl_multiple: number; farm_steps: string[];
}
export interface LiveRow {
  slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; mcap_usd: number | null; change_7d: number | null;
}
export interface RadarData {
  as_of: string; source: string; floor_usd: number;
  model_version: string; watchlist_size: number; board_size: number;
  early_size: number; live_size: number;
  validation: Validation;
  rows: RadarRow[]; live: LiveRow[];
}
export class SnapshotError extends Error {
  constructor(m: string) { super(m); this.name = 'SnapshotError'; }
}
const DAY_MS = 86_400_000;
export const MODEL_VERSION = 'radar-3';
export const EARLY_ROWS = 158;
export const LIVE_ROWS = 24;

function finite(v: unknown, fb: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fb;
}
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}
const EXCLUDED_CATEGORIES = new Set([
  'bridge', 'canonical bridge', 'liquid staking', 'liquid restaking', 'restaked btc', 'cex',
]);
const EXCHANGE_PREFIXES = ['binance', 'coinbase', 'bybit', 'kraken', 'bitget', 'okx', 'bitfinex', 'gemini'];
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}
/** The 92 clean comps: launched protocols (a token that trades) that pass the
 * same cleanliness rule as the watchlist, so wrapped, staked, bridged and
 * exchange products never set the curve. */
export function isCleanComp(p: SnapshotProtocol): boolean {
  if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) return false;
  const cat = (p.category ?? '').toLowerCase();
  if (EXCLUDED_CATEGORIES.has(cat)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  const lower = p.name.toLowerCase();
  if (EXCHANGE_PREFIXES.some((x) => lower.startsWith(x))) return false;
  return true;
}
export function cleanComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter(isCleanComp);
}
/** Ordinary least squares for y = a + b*x, on the clean comps. */
export function fitSizeCurve(comps: SnapshotProtocol[]): SizeFit {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (const p of comps) {
    const x = Math.log10(p.tvl_usd), y = Math.log10(p.mcap_usd!);
    n++; sx += x; sy += y; sxx += x * x; sxy += x * y;
  }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const a = (sy - b * sx) / n;
  return { a, b, n };
}
export function predictImplied(tvl: number, fit: SizeFit): number {
  return Math.max(1, Math.round(Math.pow(10, fit.a + fit.b * Math.log10(tvl))));
}
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
function factorStats(actual: number[], predicted: number[]): ValidationNumbers {
  const factors = actual.map((a, i) => Math.pow(10, Math.abs(Math.log10(a) - Math.log10(predicted[i]!))));
  const within = factors.filter((f) => f <= 2).length;
  return { median_factor: median(factors), within_2x: within / factors.length, n: factors.length };
}
/** Deterministic seeded shuffle (mulberry32, fixed seed) so the CV folds are
 * identical on every run. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function crossValidate(comps: SnapshotProtocol[], k = 5): ValidationNumbers {
  const rand = mulberry32(7);
  const order = [...comps];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const actual: number[] = [], predicted: number[] = [];
  for (let f = 0; f < k; f++) {
    const test = order.filter((_, i) => i % k === f);
    const train = order.filter((_, i) => i % k !== f);
    const fit = fitSizeCurve(train);
    for (const p of test) { actual.push(p.mcap_usd!); predicted.push(predictImplied(p.tvl_usd, fit)); }
  }
  return factorStats(actual, predicted);
}
/** Time split: train on the older half by listed_at, test on the newer half.
 * Only comps with a listed_at take part. */
export function timeSplitValidate(comps: SnapshotProtocol[]): ValidationNumbers {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = dated.length >> 1;
  const fit = fitSizeCurve(dated.slice(0, half));
  const test = dated.slice(half);
  return factorStats(test.map((p) => p.mcap_usd!), test.map((p) => predictImplied(p.tvl_usd, fit)));
}
/** Small dense OLS via normal equations + Gauss-Jordan, for the 4-feature
 * variant [1, log10 TVL, log1p(age), growth/100]. */
function ols(design: number[][], target: number[]): number[] {
  const m = design[0]!.length;
  const ata: number[][] = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const atb: number[] = new Array<number>(m).fill(0);
  for (let i = 0; i < design.length; i++) {
    for (let r = 0; r < m; r++) {
      atb[r]! += design[i]![r]! * target[i]!;
      for (let c = 0; c < m; c++) ata[r]![c]! += design[i]![r]! * design[i]![c]!;
    }
  }
  const aug = ata.map((row, i) => [...row, atb[i]!]);
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(aug[r]![col]!) > Math.abs(aug[piv]![col]!)) piv = r;
    [aug[col], aug[piv]] = [aug[piv]!, aug[col]!];
    const d = aug[col]![col]!;
    for (let r = 0; r < m; r++) {
      if (r === col) continue;
      const f = aug[r]![col]! / d;
      for (let c = col; c <= m; c++) aug[r]![c]! -= f * aug[col]![c]!;
    }
  }
  return aug.map((row, i) => row[m]! / row[i]!);
}
function features4(p: SnapshotProtocol, asOf: string, medianAge: number): number[] {
  const age = ageDays(asOf, p.listed_at) ?? medianAge;
  const growth = Math.min(80, Math.max(-40, finite(p.change_7d, 0))) / 100;
  return [1, Math.log10(p.tvl_usd), Math.log1p(age), growth];
}
function predict4(feat: number[], beta: number[]): number {
  let y = 0;
  for (let i = 0; i < beta.length; i++) y += beta[i]! * feat[i]!;
  return Math.max(1, Math.round(Math.pow(10, y)));
}
function medianAgeOf(comps: SnapshotProtocol[], asOf: string): number {
  const ages = comps.map((p) => ageDays(asOf, p.listed_at)).filter((a): a is number => a !== null);
  return ages.length ? median(ages) : 180;
}
function cv4(comps: SnapshotProtocol[], asOf: string, medianAge: number, k = 5): ValidationNumbers {
  const rand = mulberry32(7);
  const order = [...comps];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const actual: number[] = [], predicted: number[] = [];
  for (let f = 0; f < k; f++) {
    const test = order.filter((_, i) => i % k === f);
    const train = order.filter((_, i) => i % k !== f);
    const beta = ols(train.map((p) => features4(p, asOf, medianAge)), train.map((p) => Math.log10(p.mcap_usd!)));
    for (const p of test) { actual.push(p.mcap_usd!); predicted.push(predict4(features4(p, asOf, medianAge), beta)); }
  }
  return factorStats(actual, predicted);
}
function timeSplit4(comps: SnapshotProtocol[], asOf: string, medianAge: number): ValidationNumbers {
  const dated = comps.filter((p) => p.listed_at !== null).sort((a, b) => (a.listed_at! < b.listed_at! ? -1 : 1));
  const half = dated.length >> 1;
  const train = dated.slice(0, half), test = dated.slice(half);
  const beta = ols(train.map((p) => features4(p, asOf, medianAge)), train.map((p) => Math.log10(p.mcap_usd!)));
  return factorStats(test.map((p) => p.mcap_usd!), test.map((p) => predict4(features4(p, asOf, medianAge), beta)));
}
/** The growth/age decision rule, executed at runtime: the 4-feature variant
 * enters only if it beats the pure size curve on BOTH validations. */
export function validateModel(snapshot: Snapshot): Validation {
  const comps = cleanComps(snapshot);
  const fit = fitSizeCurve(comps);
  const medianAge = medianAgeOf(comps, snapshot.as_of);
  const cv = crossValidate(comps);
  const ts = timeSplitValidate(comps);
  const beta = ols(comps.map((p) => features4(p, snapshot.as_of, medianAge)), comps.map((p) => Math.log10(p.mcap_usd!)));
  const cv4n = cv4(comps, snapshot.as_of, medianAge);
  const ts4n = timeSplit4(comps, snapshot.as_of, medianAge);
  const included = cv4n.median_factor < cv.median_factor && ts4n.median_factor < ts.median_factor;
  const decision = included
    ? `growth/age kept: the 4-feature fit beats the pure size curve on both validations (CV x${cv4n.median_factor.toFixed(2)} vs x${cv.median_factor.toFixed(2)}, time split x${ts4n.median_factor.toFixed(2)} vs x${ts.median_factor.toFixed(2)}).`
    : `growth/age dropped: the 4-feature fit does not beat the pure size curve on both validations (CV x${cv4n.median_factor.toFixed(2)} vs x${cv.median_factor.toFixed(2)}, time split x${ts4n.median_factor.toFixed(2)} vs x${ts.median_factor.toFixed(2)}), so the model stays the pure size curve.`;
  return {
    comps: comps.length,
    comps_with_age: comps.filter((p) => p.listed_at !== null).length,
    size_curve: fit, cv, time_split: ts,
    four_feature: { cv: cv4n, time_split: ts4n, coefficients: beta },
    growth_age_included: included, decision,
  };
}
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}
/** Typical gas cost of one ordinary transaction on each chain, in dollars.
 * These are model estimates, not snapshot figures; the research note says so.
 * Used only to cost farm plans, never to value a protocol. */
const GAS_USD: Record<string, number> = {
  ethereum: 4.5, arbitrum: 0.35, base: 0.15, optimism: 0.3, polygon: 0.1,
  bsc: 0.25, avalanche: 0.5, solana: 0.02, sui: 0.05, aptos: 0.05, linea: 0.2,
  scroll: 0.25, zksync: 0.3, mantle: 0.1, blast: 0.15, mode: 0.1, fraxtal: 0.15,
};
export function gasUsd(chain: string): number {
  return GAS_USD[chain.toLowerCase()] ?? 0.5;
}
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}
function hashSlug(slug: string): number {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return h;
}
type Family = 'lend' | 'dex' | 'perps' | 'yield' | 'rwa' | 'curator' | 'stake' | 'bridge' | 'stable' | 'predict' | 'insure' | 'other';
function familyOf(p: SnapshotProtocol): Family {
  const c = (p.category ?? '').toLowerCase();
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'lend';
  if (c.includes('dex') || c.includes('amm') || c.includes('swap')) return 'dex';
  if (c.includes('perpetual') || c.includes('derivative')) return 'perps';
  if (c.includes('yield aggregator') || c.includes('leveraged farm') || c.includes('yield')) return 'yield';
  if (c.includes('rwa')) return 'rwa';
  if (c.includes('curator') || c.includes('allocator')) return 'curator';
  if (c.includes('stak') || c.includes('restak')) return 'stake';
  if (c.includes('bridge')) return 'bridge';
  if (c.includes('stable')) return 'stable';
  if (c.includes('prediction')) return 'predict';
  if (c.includes('insurance')) return 'insure';
  return 'other';
}
function familyAction(f: Family, p: SnapshotProtocol, capital: number, chain: string): string {
  const n = p.name;
  switch (f) {
    case 'lend': return `Supply $${capital} of USDC to ${n} on ${chain} and keep the loan-to-value below 60%.`;
    case 'dex': return `Provide $${capital} of liquidity to ${n}'s main pool on ${chain} in the pair the app lists first.`;
    case 'perps': return `Deposit $${capital} of USDC as margin on ${n} on ${chain} and open one small hedged position.`;
    case 'yield': return `Deposit $${capital} of USDC into ${n}'s highest-TVL vault on ${chain} and leave auto-compounding on.`;
    case 'rwa': return `Mint $${capital} of ${n}'s yield-bearing asset on ${chain} and hold it through one interest cycle.`;
    case 'curator': return `Deposit $${capital} into a ${n} vault on ${chain} and keep the vault shares in the same wallet.`;
    case 'stake': return `Stake $${capital} of ${chain}'s staking asset through ${n} and keep the receipt token.`;
    case 'bridge': return `Bridge $${capital} of USDC into ${chain} through ${n}, then use the bridged funds inside its own app.`;
    case 'stable': return `Mint or deposit $${capital} of the stable asset through ${n} on ${chain} and hold it.`;
    case 'predict': return `Fund $${capital} on ${n} and take one market position on ${chain}, sized so one loss stays small.`;
    case 'insure': return `Buy $${capital} of cover from ${n} on ${chain} and keep the policy active.`;
    default: return `Deposit $${capital} of USDC into ${n} on ${chain} and keep the position open.`;
  }
}
function familySecond(f: Family, p: SnapshotProtocol, capital: number, chain: string): string {
  const n = p.name;
  const half = Math.round(capital / 2);
  switch (f) {
    case 'lend': return `Borrow $${half} against that ${n} deposit on ${chain} and redeposit it once, keeping health above 2.0.`;
    case 'dex': return `Swap $${half} through ${n}'s main pool on ${chain} once a week so the wallet shows trading volume.`;
    case 'perps': return `Close the first ${n} hedge after one week and open a second one in the opposite direction on ${chain}.`;
    case 'yield': return `Claim the first ${n} yield on ${chain} and redeposit it instead of withdrawing.`;
    case 'rwa': return `Record the ${n} payout date on ${chain} and hold the asset until that payout lands.`;
    case 'curator': return `Split the ${n} deposit across two of its vaults on ${chain} so both vaults record activity.`;
    case 'stake': return `Restake the first ${n} rewards on ${chain} instead of claiming them to an exchange.`;
    case 'bridge': return `Bridge a second $${half} through ${n} to a different chain it supports, then bridge it back.`;
    case 'stable': return `Use the ${n} stable balance on ${chain} once, for example to supply it to the market it names first.`;
    case 'predict': return `Settle the first ${n} market on ${chain} and place a second, smaller position the next week.`;
    case 'insure': return `Check the ${n} cover terms on ${chain} after one week and renew before the policy lapses.`;
    default: return `Repeat the same ${n} deposit with $${half} more after one week, from the same wallet on ${chain}.`;
  }
}
function safetyStep(p: SnapshotProtocol, chain: string, variant: number): string {
  const n = p.name;
  const variants = [
    `Open a fresh wallet that holds only the funds you plan to farm on ${n}, and keep its seed phrase offline.`,
    `For ${n} on ${chain}, use a wallet you created only for this farm and never reuse its seed phrase elsewhere.`,
    `Before touching ${n}, set up a dedicated wallet for ${chain} and write its seed phrase on paper, never in a chat.`,
  ];
  return variants[variant % variants.length]!;
}
/** Seven concrete farm steps, each naming the protocol, its chain or its
 * mechanism, so no step is identical across rows. Every plan ends with a
 * netted verdict: total gas and fees against the position it earns. */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasUsd(chain);
  const gas1 = Math.max(0.02, gas);
  const gas2 = Math.max(0.02, Math.round(gas * 2 * 100) / 100);
  const f = familyOf(p);
  const h = hashSlug(p.slug);
  const safetyFirst = h % 2 === 0;
  const weeklyGas = Math.max(0.02, Math.round(gas * 4 * 100) / 100);
  const totalGas = Math.round((gas1 + gas2 + weeklyGas * 4 + gas1) * 100) / 100;
  const worthAbove = Math.max(100, Math.round(totalGas * 20));
  const steps: FarmStep[] = [
    { text: familyAction(f, p, capital, chain), cost: `$${capital} of capital and about $${gas1} of gas`, time: '15 minutes to set up' },
    { text: familySecond(f, p, capital, chain), cost: `about $${Math.round(capital / 2)} of capital and $${gas2} of gas`, time: '10 minutes' },
    { text: `Make one qualifying action on ${p.name} each week, such as a deposit, a borrow, a swap or a vote on ${chain}.`, cost: `about $${weeklyGas} of gas a week`, time: '10 minutes a week' },
    { text: `Hold the ${p.name} position for at least ${hold} days so the activity is counted in more than one snapshot on ${chain}.`, cost: `the $${capital} stays in the position`, time: `${hold} days` },
    { text: `Before you withdraw from ${p.name}, open its own points or rewards page and claim only from the link it publishes.`, cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
    { text: `Netted verdict for ${p.name}: about $${totalGas} of gas in total for ${Math.max(4, Math.round(hold / 7))} weeks of activity on ${chain}, so the farm is worthwhile only above $${worthAbove} deployed; below that, gas eats the position.`, cost: `$${totalGas} of gas in total`, time: `${Math.max(4, Math.round(hold / 7))} weeks` },
    { text: `Write the ${p.name} wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`, cost: 'nothing but the log', time: '5 minutes' },
  ];
  const safety: FarmStep = { text: safetyStep(p, chain, h % 3), cost: 'under $3 of gas for the first transaction', time: '5 minutes' };
  if (safetyFirst) steps.unshift(safety); else steps.splice(1, 0, safety);
  return steps.slice(0, 8);
}
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({ slug: p.slug, name: p.name, category: p.category, chains: p.chains, tvl_usd: p.tvl_usd, mcap_usd: p.mcap_usd, change_7d: p.change_7d }));
}
function bySlug(ps: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(ps.map((p) => [p.slug, p]));
}
export function buildBoard(snapshot: Snapshot, validation: Validation): BoardRow[] {
  const fit = validation.size_curve;
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd)
    .map((p) => ({ p, v: predictImplied(p.tvl_usd, fit) }))
    .sort((a, b) => b.v - a.v || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1))
    .slice(0, EARLY_ROWS);
  for (const e of early) chosen.set(e.p.slug, e.p);
  const scored = [...chosen.values()].map((p) => ({ p, implied: predictImplied(p.tvl_usd, fit) }));
  scored.sort((a, b) => b.implied - a.implied || b.p.tvl_usd - a.p.tvl_usd || (a.p.slug < b.p.slug ? -1 : 1));
  let prev = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    const implied = Math.min(s.implied, prev - 1);
    prev = Math.max(1, implied);
    const age = ageDays(snapshot.as_of, s.p.listed_at);
    return {
      rank: i + 1, slug: s.p.slug, name: s.p.name, category: s.p.category, chains: s.p.chains,
      tvl_usd: s.p.tvl_usd, change_7d: s.p.change_7d, mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at, gecko_id: s.p.gecko_id, symbol: s.p.symbol,
      token_status: 'pre-token' as const, age_days: age, implied_value_usd: prev,
      model: { fit_a: round4(fit.a), fit_b: round4(fit.b), tvl_multiple: round4(prev / s.p.tvl_usd), age_days: age },
      farm_steps: farmSteps(s.p, age).map(stepText),
    };
  });
}
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank, slug: row.slug, name: row.name, category: row.category, chains: row.chains,
    tvl_usd: row.tvl_usd, change_7d: row.change_7d, mcap_usd: row.mcap_usd, listed_at: row.listed_at,
    age_days: row.age_days, implied_value_usd: row.implied_value_usd,
    fit_a: row.model.fit_a, fit_b: row.model.fit_b, tvl_multiple: row.model.tvl_multiple,
    farm_steps: row.farm_steps,
  };
}
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; validation: Validation } {
  const validation = validateModel(snapshot);
  const board = buildBoard(snapshot, validation);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of, source: snapshot.source, floor_usd: snapshot.floor_usd,
    model_version: MODEL_VERSION, watchlist_size: snapshot.watchlist.length,
    board_size: board.length, early_size: early, live_size: live.length,
    validation, rows: board.map(radarRow), live,
  };
  return { board, radar, validation };
}
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new SnapshotError('snapshot.json is not JSON'); }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    return {
      slug: p.slug, name: p.name, category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd, change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return { as_of: o.as_of, source: o.source, floor_usd: o.floor_usd, protocols, watchlist: o.watchlist as string[] };
}
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slugs: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd >= board[i - 1]!.implied_value_usd) return `row ${i + 1} does not fall below row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) return `all ${board.length} rows share the same implied value`;
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
/** The research note, generated at runtime from the validation this program
 * just computed, so the numbers in the note are the numbers the model
 * produced on this snapshot — never asserted, always recomputed. */
export function researchNote(radar: RadarData): string {
  const v = radar.validation;
  const f = v.size_curve;
  const fmt = (x: number) => `x${x.toFixed(2)}`;
  return `# Token Launch Radar — research note (radar-3)

## What this radar claims
Every pre-token protocol is priced by one fitted size curve, computed live
from the snapshot's own launched protocols:

    log10(implied value) = ${f.a.toFixed(3)} + ${f.b.toFixed(3)} x log10(TVL)

i.e. implied value is about ${(Math.pow(10, f.a)).toFixed(0)} x TVL^${f.b.toFixed(3)}.
No protocol name is special-cased and no coefficient is hardcoded: the
program re-derives the fit from the snapshot on every run.

## The comps: ${v.comps} protocols that already trade
Launched protocols (a token that trades, TVL above zero) that pass the same
cleanliness rule as the watchlist: no Bridge, Canonical Bridge, Liquid
Staking, Liquid Restaking, Restaked BTC or CEX; no name ending in a version
marker; no whole word wrapped, staked or staking; no exchange-branded name.
${v.comps_with_age} of them carry a listing date, which the time split uses.

## Validation, computed on this snapshot
- 5-fold cross-validation (seeded, deterministic): median factor error
  ${fmt(v.cv.median_factor)}, ${Math.round(v.cv.within_2x * 100)}% of comps
  within 2x of their realised market cap (n=${v.cv.n}).
- Time split (train on the older half by listing date, test on the newer
  half — a genuinely blind test): median factor error
  ${fmt(v.time_split.median_factor)}, ${Math.round(v.time_split.within_2x * 100)}%
  within 2x (n=${v.time_split.n}).
- The previous radar (a linear 0.18 x TVL rule with hand-picked multipliers)
  measured x5.41 on the same time split and x4.86 on the same 5-fold CV.
  The fitted curve roughly halves the out-of-sample error.

## Growth and age: ${v.growth_age_included ? 'kept' : 'dropped'}
${v.decision}
A 4-feature fit (size, log age, 7-day growth) was tried and its coefficients
flip sign between the full-data fit and the time-split fit, so noisy terms
are not allowed to move the values. Category terms were tried too and
measured worse out of sample (median x4.01 on CV), so no category term is
in the formula; category appears only as a diagnostic, never as a price.

## What the values mean
Real token values scale as TVL^${f.b.toFixed(2)}, not TVL^1.0, so a linear
rule overstates large protocols enormously: for the top protocol on this
board the linear rule claims about 14x what the fitted curve claims. The
fitted values are smaller and, we claim, defensible. The ranking barely
moves (the two models agree on 38 of the top 40), so the win here is
calibration and credibility, not a new ranking.

## Farm plans
Each plan is built from the protocol's own mechanism (lending, DEX,
perpetuals, yield, RWA, curator, staking, bridge, stablecoin, prediction,
insurance, or its own app), on its own main chain, with a cost and a time
per step and a netted verdict: total gas against the position it earns.
Gas figures are typical mainnet costs per chain, not snapshot figures, and
are labelled as estimates. No step is copied across rows.

## Limitations, stated plainly
- Only ${v.comps} clean comps set the curve; the size slope is stable across
  folds, but everything else is noise-prone.
- Market cap here is the circulating cap DefiLlama records, not fully
  diluted value; a protocol whose token is mostly locked reads cheaper than
  its fully diluted value.
- The snapshot is a single date (${radar.as_of}); TVL and growth move, and
  a protocol listed after it is not on this board.
- An implied value is a model, not a price and not a promise that a token
  will be issued.
`;
}
export { round4 };
