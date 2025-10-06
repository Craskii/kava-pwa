export type Match = { p1?: string; p2?: string };
export type Round = Match[];

export function seedSingleElim(players: string[]): Round[] {
  const names = [...players];
  const n = nextPow2(Math.max(1, names.length));
  while (names.length < n) names.push("BYE");
  const seeds = bracketSeedOrder(n).map(i => names[i-1]);

  const rounds: Round[] = [];
  const r1: Round = [];
  for (let i = 0; i < n; i += 2) r1.push({ p1: seeds[i], p2: seeds[i+1] });
  rounds.push(r1);

  let m = n / 2;
  while (m >= 2) {
    rounds.push(Array.from({ length: m / 2 }, () => ({})));
    m = m / 2;
  }
  return rounds;
}
function nextPow2(x: number) { return 1 << (32 - Math.clz32(x - 1)); }
function bracketSeedOrder(n: number): number[] {
  let arr = [1,2];
  while (arr.length < n) {
    const m = arr.length * 2;
    const next: number[] = [];
    for (const s of arr) { next.push(s); next.push(m + 1 - s); }
    arr = next;
  }
  return arr.slice(0, n);
}
