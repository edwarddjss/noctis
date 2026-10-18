/**
 * Competitions MatchNest covers via ESPN, keyed by ESPN's league slug.
 * Used for live-score fan-out, league browsing and team search. Add or remove
 * slugs here; everything else adapts.
 */
export interface LeagueInfo {
  slug: string;
  name: string;
  country: string;
  type: "league" | "cup";
  /** Larger = listed first and polled for live scores more eagerly. */
  priority: number;
}

const LEAGUES: LeagueInfo[] = [
  { slug: "uefa.champions", name: "UEFA Champions League", country: "Europe", type: "cup", priority: 100 },
  { slug: "eng.1", name: "Premier League", country: "England", type: "league", priority: 99 },
  { slug: "esp.1", name: "LaLiga", country: "Spain", type: "league", priority: 98 },
  { slug: "ger.1", name: "Bundesliga", country: "Germany", type: "league", priority: 97 },
  { slug: "ita.1", name: "Serie A", country: "Italy", type: "league", priority: 96 },
  { slug: "fra.1", name: "Ligue 1", country: "France", type: "league", priority: 95 },
  { slug: "usa.1", name: "MLS", country: "USA", type: "league", priority: 94 },
  { slug: "uefa.europa", name: "UEFA Europa League", country: "Europe", type: "cup", priority: 93 },
  { slug: "uefa.europa.conf", name: "UEFA Conference League", country: "Europe", type: "cup", priority: 92 },
  { slug: "ned.1", name: "Eredivisie", country: "Netherlands", type: "league", priority: 90 },
  { slug: "por.1", name: "Primeira Liga", country: "Portugal", type: "league", priority: 89 },
  { slug: "eng.2", name: "Championship", country: "England", type: "league", priority: 88 },
  { slug: "mex.1", name: "Liga MX", country: "Mexico", type: "league", priority: 87 },
  { slug: "bra.1", name: "Brasileirão Série A", country: "Brazil", type: "league", priority: 86 },
  { slug: "arg.1", name: "Liga Profesional Argentina", country: "Argentina", type: "league", priority: 85 },
  { slug: "sco.1", name: "Scottish Premiership", country: "Scotland", type: "league", priority: 84 },
  { slug: "tur.1", name: "Süper Lig", country: "Turkey", type: "league", priority: 83 },
  { slug: "bel.1", name: "Belgian Pro League", country: "Belgium", type: "league", priority: 82 },
  { slug: "ksa.1", name: "Saudi Pro League", country: "Saudi Arabia", type: "league", priority: 81 },
  { slug: "conmebol.libertadores", name: "CONMEBOL Libertadores", country: "South America", type: "cup", priority: 80 },
  { slug: "eng.fa", name: "FA Cup", country: "England", type: "cup", priority: 79 },
  { slug: "eng.league_cup", name: "Carabao Cup", country: "England", type: "cup", priority: 78 },
  { slug: "esp.copa_del_rey", name: "Copa del Rey", country: "Spain", type: "cup", priority: 77 },
  { slug: "ger.dfb_pokal", name: "DFB-Pokal", country: "Germany", type: "cup", priority: 76 },
  { slug: "ita.coppa_italia", name: "Coppa Italia", country: "Italy", type: "cup", priority: 75 },
  { slug: "fra.coupe_de_france", name: "Coupe de France", country: "France", type: "cup", priority: 74 },
  { slug: "eng.3", name: "League One", country: "England", type: "league", priority: 70 },
  { slug: "esp.2", name: "LaLiga 2", country: "Spain", type: "league", priority: 69 },
  { slug: "ger.2", name: "2. Bundesliga", country: "Germany", type: "league", priority: 68 },
  { slug: "ita.2", name: "Serie B", country: "Italy", type: "league", priority: 67 },
  { slug: "jpn.1", name: "J1 League", country: "Japan", type: "league", priority: 60 },
  { slug: "usa.nwsl", name: "NWSL", country: "USA", type: "league", priority: 59 },
  { slug: "eng.w.1", name: "Women's Super League", country: "England", type: "league", priority: 58 },
  { slug: "uefa.nations", name: "UEFA Nations League", country: "Europe", type: "cup", priority: 57 },
  { slug: "fifa.worldq.uefa", name: "World Cup Qualifying – UEFA", country: "Europe", type: "cup", priority: 56 },
  { slug: "fifa.friendly", name: "International Friendlies", country: "International", type: "cup", priority: 50 },
];

export const ESPN_LEAGUES: LeagueInfo[] = [...LEAGUES].sort((a, b) => b.priority - a.priority);

export const LEAGUE_BY_SLUG = new Map(ESPN_LEAGUES.map((l) => [l.slug, l]));

/** Composite ids carry the league so any endpoint can be called: "eng.1.359". */
export function makeId(league: string, id: string | number): string {
  return `${league}.${id}`;
}

export function parseId(composite: string): { league: string; id: string } | null {
  const m = /^([a-z0-9_.-]+)\.(\d{1,12})$/i.exec(composite);
  return m ? { league: m[1]!.toLowerCase(), id: m[2]! } : null;
}
