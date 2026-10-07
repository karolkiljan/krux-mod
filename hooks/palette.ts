// Paleta pikseli: jeden znak siatki to jeden kolor. Osobno od scen, żeby arkusz
// klatek i fartuchy nie ciągnęły za sobą całego katalogu czynności.
export const PALETTE: Record<string, string> = {
  g: '#5c9e3a', // skóra orka
  G: '#33521f', // spodnie, zamknięte oko
  r: '#e0322b', // oko
  t: '#f0e6c8', // kieł
  b: '#7a4b2a', // skórzany fartuch
  h: '#9b6a3c', // trzonek młota
  S: '#59616b', // obuch młota
  s: '#8d969f', // kowadło
  R: '#d9381e', // rozgrzana stal
  o: '#ff8a1c', // iskra
  y: '#ffd447', // jasna iskra
  k: '#5a5450', // kamień paleniska
  c: '#2d2a28', // węgiel
  N: '#3f6f6a', // fartuch Niucha
  M: '#a33a2a', // fartuch Groma
  P: '#c9a227', // fartuch Piryta
  O: '#cc7722', // fartuch Ochry
  L: '#6b7580', // fartuch Młota
  T: '#887088', // fartuch Lonta: grafit z fioletowym odcieniem
  u: '#555555', // fartuch orka bez imienia
  v: '#7b2d5a', // aksamit szezlongu
  p: '#e8d9a8', // pergamin
  n: '#4a3b30', // atrament, węgiel rysownika
  l: '#1f5c3a', // ciemny liść krzaka
  f: '#2f7d4c', // jasny liść krzaka
  w: '#6a6f8c', // kruk
  W: '#3a7bd5', // woda
  i: '#8ec5ff', // jasna woda, szkło
  m: '#9a9a9a', // dym
  B: '#6b2f2f', // oprawa księgi
  x: '#5a3a1e', // ciemne drewno
  q: '#8a847e', // jasny kamień
  a: '#3e6b22', // trawa
  j: '#f5f5f5', // biel: pióro, papier, łuska
  d: '#b22222', // czerwony materiał, flaga
  e: '#2e4a7d', // granatowy materiał, obicie fotela
}

// Fartuchy kumpli: tych znaków czynność nie używa, bo kumpel podmienia nimi 'b'.
export const MATE_APRONS: ReadonlySet<string> = new Set(['N', 'M', 'P', 'O', 'L', 'T', 'u'])
