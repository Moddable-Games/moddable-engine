import { renderBoard, fenToPosition } from './board-diagrams.js'
import { getGameConfig, getAllGames, HexSvg, createSeededRng } from './hex-games/index.js'
import { getDeckConfig, getRegisteredDecks, createDeck, shuffle, deal, layoutTable } from './deck-manager/index.js'
import { renderRpgProvider } from './rpg-provider.js'
import { renderFromResolved, loadGalleryIndex as loadAdapterGallery, setDeckRenderer, setMahjongRenderer, setTableauRenderer, setMultiBoardRenderer } from './render-adapter.js'
import { resolveSurface } from './surface-resolver.js'
import { resolve as cascadeResolve } from './cascade-resolver.js'
import { loadVariant } from './schema-loader.js'

setDeckRenderer(renderDeckSvg)
setMahjongRenderer(renderMahjongSvg)
setTableauRenderer(renderTableauSvg)
setMultiBoardRenderer(renderMultiBoard)


// ─── FEN → pieceImages mapping ──────────────────────────────────────────────

const FEN_TO_PIECE_ID = {
  K: 'wK', Q: 'wQ', R: 'wR', B: 'wB', N: 'wN', P: 'wP',
  k: 'bK', q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP',
  A: 'wA', a: 'bA', C: 'wC', c: 'bC', D: 'wD', d: 'bD',
  E: 'wE', e: 'bE', F: 'wF', f: 'bF', G: 'wG', g: 'bG',
  H: 'wH', h: 'bH', I: 'wI', i: 'bI', J: 'wJ', j: 'bJ',
  L: 'wL', l: 'bL', M: 'wM', m: 'bM', O: 'wO', o: 'bO',
  S: 'wS', s: 'bS', T: 'wT', t: 'bT', U: 'wU', u: 'bU',
  V: 'wV', v: 'bV', W: 'wW', w: 'bW', Y: 'wY', y: 'bY',
  Z: 'wZ', z: 'bZ',
}

const GAME_FEN_OVERRIDES = {
  xiangqi: { H: 'wN', h: 'bN', R: 'wR', r: 'bR', E: 'wE', e: 'bE', A: 'wA', a: 'bA', K: 'wK', k: 'bK', C: 'wC', c: 'bC', P: 'wP', p: 'bP', V: 'wV', v: 'bV', B: 'wB', b: 'bB', I: 'wI', i: 'bI', U: 'wU', u: 'bU', Z: 'wZ', z: 'bZ' },
  'xiangqi/jieqi': { K: 'wK', k: 'bK', F: 'wFD', f: 'bFD' },
  'dou-shou-qi': {
    E: 'wElephant', e: 'bElephant', L: 'wLion', l: 'bLion',
    T: 'wTiger', t: 'bTiger', P: 'wLeopard', p: 'bLeopard',
    D: 'wDog', d: 'bDog', W: 'wWolf', w: 'bWolf',
    C: 'wCat', c: 'bCat', R: 'wRat', r: 'bRat',
  },
  asalto: { officer: 'red-circle', soldier: 'green-circle' },
  'shogi/sho-shogi': {
    K: 'wK', k: 'bK', G: 'wG', g: 'bG', S: 'wS', s: 'bS', N: 'wN', n: 'bN',
    L: 'wL', l: 'bL', R: 'wR', r: 'bR', B: 'wB', b: 'bB', P: 'wP', p: 'bP',
    E: 'wE', e: 'bE',
  },
  'shogi/dobutsu': {
    G: 'wdG', g: 'bdG', L: 'wdL', l: 'bdL', E: 'wdE', e: 'bdE', C: 'wdC', c: 'bdC', H: 'wdH', h: 'bdH',
  },
  'shogi/cannon-shogi': {
    K: 'wK', k: 'bK', G: 'wG', g: 'bG', S: 'wS', s: 'bS', N: 'wN', n: 'bN',
    L: 'wL', l: 'bL', R: 'wR', r: 'bR', B: 'wB', b: 'bB', P: 'wP', p: 'bP',
    A: 'wcA', a: 'bcA', U: 'wcU', u: 'bcU', I: 'wcI', i: 'bcI', C: 'wcC', c: 'bcC',
  },
  'shogi/tori-shogi': {
    C: 'wtC', c: 'btC', F: 'wtF', f: 'btF', P: 'wtP', p: 'btP',
    R: 'wtR', r: 'btR', L: 'wtL', l: 'btL', S: 'wtS', s: 'btS',
    K: 'wtK', k: 'btK', G: 'wtG', g: 'btG',
  },
  'shogi/yari-shogi': {
    K: 'wK', k: 'bK', B: 'wB', b: 'bB', N: 'wN', n: 'bN', P: 'wP', p: 'bP',
    Y: 'wY', y: 'bY', G: 'wG', g: 'bG', S: 'wS', s: 'bS',
  },
  'shogi/dai-shogi': {
    LN: 'wLN', ln: 'bLN', KN: 'wKN', kn: 'bKN', ST: 'wST', st: 'bST',
    IG: 'wIG', ig: 'bIG', CG: 'wCG', cg: 'bCG', SG: 'wSG', sg: 'bSG',
    GG: 'wGG', gg: 'bGG', KI: 'wKI', ki: 'bKI', DE: 'wDE', de: 'bDE',
    RC: 'wRC', rc: 'bRC', CT: 'wCT', ct: 'bCT', FL: 'wFL', fl: 'bFL',
    BT: 'wBT', bt: 'bBT', VO: 'wVO', vo: 'bVO', AB: 'wAB', ab: 'bAB',
    EW: 'wEW', ew: 'bEW', KR: 'wKR', kr: 'bKR', LI: 'wLI', li: 'bLI',
    PH: 'wPH', ph: 'bPH', RK: 'wRK', rk: 'bRK', FY: 'wFY', fy: 'bFY',
    SM: 'wSM', sm: 'bSM', VM: 'wVM', vm: 'bVM', BI: 'wBI', bi: 'bBI',
    DH: 'wDH', dh: 'bDH', DK: 'wDK', dk: 'bDK', FK: 'wFK', fk: 'bFK',
    PW: 'wPW', pw: 'bPW', GB: 'wGB', gb: 'bGB',
  },
  'shogi/tenjiku-shogi': {
    LN: 'wLN', ln: 'bLN', KN: 'wKN', kn: 'bKN', FL: 'wFL', fl: 'bFL',
    IG: 'wIG', ig: 'bIG', CG: 'wCG', cg: 'bCG', SG: 'wSG', sg: 'bSG',
    GG: 'wGG', gg: 'bGG', KI: 'wKI', ki: 'bKI', DE: 'wDE', de: 'bDE',
    RC: 'wRC', rc: 'bRC', CS: 'wCS', cs: 'bCS', BT: 'wBT', bt: 'bBT',
    KR: 'wKR', kr: 'bKR', LI: 'wLI', li: 'bLI', FK: 'wFK', fk: 'bFK',
    PH: 'wPH', ph: 'bPH', SS: 'wSS', ss: 'bSS', VT: 'wVT', vt: 'bVT',
    BI: 'wBI', bi: 'bBI', DH: 'wDH', dh: 'bDH', DK: 'wDK', dk: 'bDK',
    WB: 'wWB', wb: 'bWB', FD: 'wFD', fd: 'bFD', LW: 'wLW', lw: 'bLW',
    FE: 'wFE', fe: 'bFE', SM: 'wSM', sm: 'bSM', VM: 'wVM', vm: 'bVM',
    RK: 'wRK', rk: 'bRK', HF: 'wHF', hf: 'bHF', SE: 'wSE', se: 'bSE',
    BG: 'wBG', bg: 'bBG', RG: 'wRG', rg: 'bRG', GR: 'wGR', gr: 'bGR',
    VG: 'wVG', vg: 'bVG', PW: 'wPW', pw: 'bPW', DG: 'wDG', dg: 'bDG',
  },
  'shogi/wa-shogi': {
    CK: 'wCK', ck: 'bCK', OC: 'wOC', oc: 'bOC', BD: 'wBD', bd: 'bBD',
    SC: 'wSC', sc: 'bSC', FG: 'wFG', fg: 'bFG', VW: 'wVW', vw: 'bVW',
    VS: 'wVS', vs: 'bVS', FC: 'wFC', fc: 'bFC', SO: 'wSO', so: 'bSO',
    CM: 'wCM', cm: 'bCM', LH: 'wLH', lh: 'bLH', FF: 'wFF', ff: 'bFF',
    SW: 'wSW', sw: 'bSW', CE: 'wCE', ce: 'bCE', TF: 'wTF', tf: 'bTF',
    RR: 'wRR', rr: 'bRR', SP: 'wSP', sp: 'bSP',
  },
  'shogi/chu-shogi': {
    K: 'wK', k: 'bK', G: 'wG', g: 'bG', S: 'wS', s: 'bS', L: 'wL', l: 'bL',
    R: 'wR', r: 'bR', B: 'wB', b: 'bB', P: 'wP', p: 'bP',
    E: 'wxE', e: 'bxE', C: 'wxC', c: 'bxC', F: 'wxF', f: 'bxF',
    A: 'wxA', a: 'bxA', T: 'wxT', t: 'bxT', O: 'wxI', o: 'bxI',
    X: 'wxH', x: 'bxH', M: 'wxM', m: 'bxM', V: 'wxV', v: 'bxV',
    H: 'wxW', h: 'bxW', D: 'wxD', d: 'bxD', N: 'wxN', n: 'bxN',
    Q: 'wxQ', q: 'bxQ', I: 'wxO', i: 'bxO',
  },
  'shogi/maka-dai-dai-shogi': {
    LN: 'wLN', ln: 'bLN', EG: 'wEG', eg: 'bEG', ST: 'wST', st: 'bST',
    TG: 'wTG', tg: 'bTG', IG: 'wIG', ig: 'bIG', CG: 'wCG', cg: 'bCG',
    SG: 'wSG', sg: 'bSG', GG: 'wGG', gg: 'bGG', DV: 'wDV', dv: 'bDV',
    KI: 'wKI', ki: 'bKI', DS: 'wDS', ds: 'bDS', RC: 'wRC', rc: 'bRC',
    CT: 'wCT', ct: 'bCT', CC: 'wCC', cc: 'bCC', CO: 'wCO', co: 'bCO',
    FL: 'wFL', fl: 'bFL', BT: 'wBT', bt: 'bBT', DE: 'wDE', de: 'bDE',
    RD: 'wRD', rd: 'bRD', BM: 'wBM', bm: 'bBM', OR: 'wOR', or: 'bOR',
    AB: 'wAB', ab: 'bAB', BB: 'wBB', bb: 'bBB', EW: 'wEW', ew: 'bEW',
    KR: 'wKR', kr: 'bKR', LI: 'wLI', li: 'bLI', PH: 'wPH', ph: 'bPH',
    DY: 'wDY', dy: 'bDY', KN: 'wKN', kn: 'bKN', VO: 'wVO', vo: 'bVO',
    FY: 'wFY', fy: 'bFY', BV: 'wBV', bv: 'bBV', WR: 'wWR', wr: 'bWR',
    LD: 'wLD', ld: 'bLD', GD: 'wGD', gd: 'bGD', SD: 'wSD', sd: 'bSD',
    RK: 'wRK', rk: 'bRK', LC: 'wLC', lc: 'bLC', SM: 'wSM', sm: 'bSM',
    SF: 'wSF', sf: 'bSF', VM: 'wVM', vm: 'bVM', BI: 'wBI', bi: 'bBI',
    DH: 'wDH', dh: 'bDH', DK: 'wDK', dk: 'bDK', CP: 'wCP', cp: 'bCP',
    FK: 'wFK', fk: 'bFK', HM: 'wHM', hm: 'bHM', RT: 'wRT', rt: 'bRT',
    PW: 'wPW', pw: 'bPW', GB: 'wGB', gb: 'bGB',
  },
  'shogi/tai-shogi': {
    LN: 'wLN', ln: 'bLN', TS: 'wTS', ts: 'bTS', WL: 'wWL', wl: 'bWL',
    FY: 'wFY', fy: 'bFY', LO: 'wLO', lo: 'bLO', DW: 'wDW', dw: 'bDW',
    RK: 'wRK', rk: 'bRK', DH: 'wDH', dh: 'bDH', DK: 'wDK', dk: 'bDK',
    FK: 'wFK', fk: 'bFK', GG: 'wGG', gg: 'bGG', DV: 'wDV', dv: 'bDV',
    EM: 'wEM', em: 'bEM', DS: 'wDS', ds: 'bDS', RC: 'wRC', rc: 'bRC',
    SI: 'wSI', si: 'bSI', SE: 'wSE', se: 'bSE', KN: 'wKN', kn: 'bKN',
    PS: 'wPS', ps: 'bPS', FT: 'wFT', ft: 'bFT', BI: 'wBI', bi: 'bBI',
    FE: 'wFE', fe: 'bFE', WE: 'wWE', we: 'bWE', FR: 'wFR', fr: 'bFR',
    SG: 'wSG', sg: 'bSG', LG: 'wLG', lg: 'bLG', CR: 'wCR', cr: 'bCR',
    RG: 'wRG', rg: 'bRG', SC: 'wSC', sc: 'bSC', WH: 'wWH', wh: 'bWH',
    RS: 'wRS', rs: 'bRS', VO: 'wVO', vo: 'bVO', CS: 'wCS', cs: 'bCS',
    BB: 'wBB', bb: 'bBB', SV: 'wSV', sv: 'bSV', GL: 'wGL', gl: 'bGL',
    BM: 'wBM', bm: 'bBM', BT: 'wBT', bt: 'bBT', BV: 'wBV', bv: 'bBV',
    WR: 'wWR', wr: 'bWR', NK: 'wNK', nk: 'bNK', GD: 'wGD', gd: 'bGD',
    SD: 'wSD', sd: 'bSD', SL: 'wSL', sl: 'bSL', WB: 'wWB', wb: 'bWB',
    FL: 'wFL', fl: 'bFL', WS: 'wWS', ws: 'bWS', EB: 'wEB', eb: 'bEB',
    CC: 'wCC', cc: 'bCC', HF: 'wHF', hf: 'bHF', OM: 'wOM', om: 'bOM',
    OK: 'wOK', ok: 'bOK', PC: 'wPC', pc: 'bPC', GT: 'wGT', gt: 'bGT',
    KR: 'wKR', kr: 'bKR', LI: 'wLI', li: 'bLI', PH: 'wPH', ph: 'bPH',
    GO: 'wGO', go: 'bGO', RB: 'wRB', rb: 'bRB', NB: 'wNB', nb: 'bNB',
    SU: 'wSU', su: 'bSU', LC: 'wLC', lc: 'bLC', BD: 'wBD', bd: 'bBD',
    WO: 'wWO', wo: 'bWO', EG: 'wEG', eg: 'bEG', ST: 'wST', st: 'bST',
    TG: 'wTG', tg: 'bTG', IG: 'wIG', ig: 'bIG', CG: 'wCG', cg: 'bCG',
    OR: 'wOR', or: 'bOR', CO: 'wCO', co: 'bCO', RD: 'wRD', rd: 'bRD',
    CP: 'wCP', cp: 'bCP', DE: 'wDE', de: 'bDE', HM: 'wHM', hm: 'bHM',
    VS: 'wVS', vs: 'bVS', HD: 'wHD', hd: 'bHD', FH: 'wFH', fh: 'bFH',
    EN: 'wEN', en: 'bEN', DY: 'wDY', dy: 'bDY', FO: 'wFO', fo: 'bFO',
    SM: 'wSM', sm: 'bSM', VM: 'wVM', vm: 'bVM', VB: 'wVB', vb: 'bVB',
    SB: 'wSB', sb: 'bSB', PR: 'wPR', pr: 'bPR', AB: 'wAB', ab: 'bAB',
    EW: 'wEW', ew: 'bEW', LD: 'wLD', ld: 'bLD', PW: 'wPW', pw: 'bPW',
    GB: 'wGB', gb: 'bGB', WT: 'wWT', wt: 'bWT',
  },
  'shogi/taikyoku-shogi': {
    AB: 'wAB', ab: 'bAB', BA: 'wBA', ba: 'bBA', BC: 'wBC', bc: 'bBC', BO: 'wBO', bo: 'bBO',
    BI: 'wBI', bi: 'bBI', BG: 'wBG', bg: 'bBG', BB: 'wBB', bb: 'bBB', BL: 'wBL', bl: 'bBL',
    BM: 'wBM', bm: 'bBM', BT: 'wBT', bt: 'bBT', BD: 'wBD', bd: 'bBD', BS: 'wBS', bs: 'bBS',
    BV: 'wBV', bv: 'bBV', BU: 'wBU', bu: 'bBU', CP: 'wCP', cp: 'bCP', CA: 'wCA', ca: 'bCA',
    CF: 'wCF', cf: 'bCF', CS: 'wCS', cs: 'bCS', CN: 'wCN', cn: 'bCN', CT: 'wCT', ct: 'bCT',
    CD: 'wCD', cd: 'bCD', CH: 'wCH', ch: 'bCH', CK: 'wCK', ck: 'bCK', CC: 'wCC', cc: 'bCC',
    CM: 'wCM', cm: 'bCM', CL: 'wCL', cl: 'bCL', CE: 'wCE', ce: 'bCE', CO: 'wCO', co: 'bCO',
    CU: 'wCU', cu: 'bCU', CG: 'wCG', cg: 'bCG', CR: 'wCR', cr: 'bCR', DS: 'wDS', ds: 'bDS',
    DV: 'wDV', dv: 'bDV', DG: 'wDG', dg: 'bDG', DY: 'wDY', dy: 'bDY', DH: 'wDH', dh: 'bDH',
    DK: 'wDK', dk: 'bDK', DE: 'wDE', de: 'bDE', EC: 'wEC', ec: 'bEC', ED: 'wED', ed: 'bED',
    EG: 'wEG', eg: 'bEG', EB: 'wEB', eb: 'bEB', EN: 'wEN', en: 'bEN', EW: 'wEW', ew: 'bEW',
    FL: 'wFL', fl: 'bFL', FE: 'wFE', fe: 'bFE', FD: 'wFD', fd: 'bFD', FI: 'wFI', fi: 'bFI',
    FG: 'wFG', fg: 'bFG', FA: 'wFA', fa: 'bFA', FC: 'wFC', fc: 'bFC', FY: 'wFY', fy: 'bFY',
    FN: 'wFN', fn: 'bFN', FH: 'wFH', fh: 'bFH', FO: 'wFO', fo: 'bFO', FS: 'wFS', fs: 'bFS',
    FM: 'wFM', fm: 'bFM', FP: 'wFP', fp: 'bFP', FR: 'wFR', fr: 'bFR', FQ: 'wFQ', fq: 'bFQ',
    FK: 'wFK', fk: 'bFK', FU: 'wFU', fu: 'bFU', FT: 'wFT', ft: 'bFT', FF: 'wFF', ff: 'bFF',
    GB: 'wGB', gb: 'bGB', GC: 'wGC', gc: 'bGC', GG: 'wGG', gg: 'bGG', GO: 'wGO', go: 'bGO',
    GL: 'wGL', gl: 'bGL', GV: 'wGV', gv: 'bGV', GT: 'wGT', gt: 'bGT', GR: 'wGR', gr: 'bGR',
    GM: 'wGM', gm: 'bGM', GS: 'wGS', gs: 'bGS', GA: 'wGA', ga: 'bGA', GU: 'wGU', gu: 'bGU',
    GD: 'wGD', gd: 'bGD', HM: 'wHM', hm: 'bHM', HF: 'wHF', hf: 'bHF', HG: 'wHG', hg: 'bHG',
    HS: 'wHS', hs: 'bHS', HN: 'wHN', hn: 'bHN', HL: 'wHL', hl: 'bHL', HR: 'wHR', hr: 'bHR',
    IG: 'wIG', ig: 'bIG', KI: 'wKI', ki: 'bKI', KN: 'wKN', kn: 'bKN', KY: 'wKY', ky: 'bKY',
    KM: 'wKM', km: 'bKM', LN: 'wLN', ln: 'bLN', LC: 'wLC', lc: 'bLC', LA: 'wLA', la: 'bLA',
    LG: 'wLG', lg: 'bLG', LT: 'wLT', lt: 'bLT', LS: 'wLS', ls: 'bLS', LH: 'wLH', lh: 'bLH',
    LI: 'wLI', li: 'bLI', LD: 'wLD', ld: 'bLD', LW: 'wLW', lw: 'bLW', LL: 'wLL', ll: 'bLL',
    LU: 'wLU', lu: 'bLU', LO: 'wLO', lo: 'bLO', LB: 'wLB', lb: 'bLB', MD: 'wMD', md: 'bMD',
    ME: 'wME', me: 'bME', MF: 'wMF', mf: 'bMF', MG: 'wMG', mg: 'bMG', MS: 'wMS', ms: 'bMS',
    NK: 'wNK', nk: 'bNK', NS: 'wNS', ns: 'bNS', NB: 'wNB', nb: 'bNB', OK: 'wOK', ok: 'bOK',
    OM: 'wOM', om: 'bOM', OR: 'wOR', or: 'bOR', OC: 'wOC', oc: 'bOC', OG: 'wOG', og: 'bOG',
    OS: 'wOS', os: 'bOS', PW: 'wPW', pw: 'bPW', PC: 'wPC', pc: 'bPC', PH: 'wPH', ph: 'bPH',
    PM: 'wPM', pm: 'bPM', PG: 'wPG', pg: 'bPG', PS: 'wPS', ps: 'bPS', PR: 'wPR', pr: 'bPR',
    PU: 'wPU', pu: 'bPU', RA: 'wRA', ra: 'bRA', RS: 'wRS', rs: 'bRS', RE: 'wRE', re: 'bRE',
    RD: 'wRD', rd: 'bRD', RC: 'wRC', rc: 'bRC', RT: 'wRT', rt: 'bRT', RI: 'wRI', ri: 'bRI',
    RG: 'wRG', rg: 'bRG', RV: 'wRV', rv: 'bRV', RW: 'wRW', rw: 'bRW', RO: 'wRO', ro: 'bRO',
    RM: 'wRM', rm: 'bRM', RK: 'wRK', rk: 'bRK', RR: 'wRR', rr: 'bRR', RU: 'wRU', ru: 'bRU',
    RX: 'wRX', rx: 'bRX', RH: 'wRH', rh: 'bRH', RP: 'wRP', rp: 'bRP', RQ: 'wRQ', rq: 'bRQ',
    RN: 'wRN', rn: 'bRN', RF: 'wRF', rf: 'bRF', RJ: 'wRJ', rj: 'bRJ', RL: 'wRL', rl: 'bRL',
    RB: 'wRB', rb: 'bRB', SV: 'wSV', sv: 'bSV', SB: 'wSB', sb: 'bSB', SI: 'wSI', si: 'bSI',
    SD: 'wSD', sd: 'bSD', SF: 'wSF', sf: 'bSF', SK: 'wSK', sk: 'bSK', SM: 'wSM', sm: 'bSM',
    SX: 'wSX', sx: 'bSX', SS: 'wSS', ss: 'bSS', SN: 'wSN', sn: 'bSN', SW: 'wSW', sw: 'bSW',
    SA: 'wSA', sa: 'bSA', SG: 'wSG', sg: 'bSG', SR: 'wSR', sr: 'bSR', SE: 'wSE', se: 'bSE',
    SL: 'wSL', sl: 'bSL', SU: 'wSU', su: 'bSU', SP: 'wSP', sp: 'bSP', SQ: 'wSQ', sq: 'bSQ',
    TC: 'wTC', tc: 'bTC', ST: 'wST', st: 'bST', SC: 'wSC', sc: 'bSC', WI: 'wWI', wi: 'bWI',
    SO: 'wSO', so: 'bSO', WD: 'wWD', wd: 'bWD', TL: 'wTL', tl: 'bTL', TG: 'wTG', tg: 'bTG',
    TF: 'wTF', tf: 'bTF', TS: 'wTS', ts: 'bTS', VS: 'wVS', vs: 'bVS', VB: 'wVB', vb: 'bVB',
    VH: 'wVH', vh: 'bVH', VL: 'wVL', vl: 'bVL', VM: 'wVM', vm: 'bVM', VP: 'wVP', vp: 'bVP',
    VT: 'wVT', vt: 'bVT', VR: 'wVR', vr: 'bVR', VW: 'wVW', vw: 'bVW', VG: 'wVG', vg: 'bVG',
    VI: 'wVI', vi: 'bVI', VD: 'wVD', vd: 'bVD', VO: 'wVO', vo: 'bVO', VA: 'wVA', va: 'bVA',
    VF: 'wVF', vf: 'bVF', WB: 'wWB', wb: 'bWB', WQ: 'wWQ', wq: 'bWQ', WG: 'wWG', wg: 'bWG',
    WS: 'wWS', ws: 'bWS', WL: 'wWL', wl: 'bWL', WE: 'wWE', we: 'bWE', WH: 'wWH', wh: 'bWH',
    WT: 'wWT', wt: 'bWT', WN: 'wWN', wn: 'bWN', WF: 'wWF', wf: 'bWF', WC: 'wWC', wc: 'bWC',
    WO: 'wWO', wo: 'bWO', DN: 'wDN', dn: 'bDN', WX: 'wWX', wx: 'bWX', WR: 'wWR', wr: 'bWR',
  },
}

function resolvePieceEntry(pieceId, entry, setId) {
  if (typeof entry === 'string') {
    return `../pieces/sets/${setId}/${entry}`
  }
  if (entry.source && entry.file) {
    return `../pieces/sets/${entry.source}/${entry.file}`
  }
  return null
}

function buildPieceImages(pieceSetId, galleryIndex, gameId, variantId) {
  const empty = { images: {}, surface: null, surfaceMap: {} }
  if (!pieceSetId || !galleryIndex) return empty
  const setDef = galleryIndex.find(s => s.id === pieceSetId)
  if (!setDef) return empty
  const images = {}
  const surfaceMap = {}

  if (setDef.extends) {
    const baseDef = galleryIndex.find(s => s.id === setDef.extends)
    if (baseDef) {
      for (const [pieceId, entry] of Object.entries(baseDef.pieces || {})) {
        const path = resolvePieceEntry(pieceId, entry, baseDef.id)
        if (path) images[pieceId] = path
      }
    }
  }

  for (const [pieceId, entry] of Object.entries(setDef.pieces || {})) {
    const path = resolvePieceEntry(pieceId, entry, pieceSetId)
    if (path) images[pieceId] = path
    if (typeof entry === 'object' && entry.surface) {
      surfaceMap[pieceId] = entry.surface
    }
  }

  const fenMap = (variantId && GAME_FEN_OVERRIDES[`${gameId}/${variantId}`]) || GAME_FEN_OVERRIDES[gameId] || FEN_TO_PIECE_ID
  for (const [fenChar, pieceId] of Object.entries(fenMap)) {
    if (images[pieceId]) {
      images[fenChar] = images[pieceId]
    }
    if (surfaceMap[pieceId]) {
      surfaceMap[fenChar] = surfaceMap[pieceId]
    }
  }
  return { images, surface: setDef.surface || null, surfaceMap }
}

const DRAUGHTS_VOCABULARY = {
  w: { type: 'man', color: 'white' },
  b: { type: 'man', color: 'black' },
  W: { type: 'king', color: 'white' },
  B: { type: 'king', color: 'black' },
}

const REVERSI_VOCABULARY = {
  w: { type: 'piece', color: 'white' },
  b: { type: 'piece', color: 'black' },
}

const STONE_VOCABULARY = {
  w: { type: 'stone', color: 'white' },
  b: { type: 'stone', color: 'black' },
}

const TAFL_VOCABULARY = {
  K: { type: 'king', color: 'white' },
  w: { type: 'stone', color: 'white' },
  b: { type: 'stone', color: 'black' },
}

function parseMancalaSetup(notation, pitsPerSide, boardRows) {
  const sections = notation.split(';')
  const players = boardRows === 4 ? 2 : 2
  const pitsPerPlayer = pitsPerSide * (boardRows / 2)
  const pits = new Array(pitsPerPlayer * players).fill(0)
  const stores = [0, 0]
  let sectionIdx = 0
  for (let p = 0; p < players; p++) {
    if (sectionIdx < sections.length) {
      const vals = sections[sectionIdx].split(',').map(s => parseInt(s.trim(), 10) || 0)
      for (let i = 0; i < vals.length && i < pitsPerPlayer; i++) {
        pits[p * pitsPerPlayer + i] = vals[i]
      }
      sectionIdx++
    }
    if (sectionIdx < sections.length) {
      stores[p] = parseInt(sections[sectionIdx].trim(), 10) || 0
      sectionIdx++
    }
  }
  return { pits, stores }
}

function parseBackgammonSetup(notation) {
  const dark = new Array(24).fill(0)
  const light = new Array(24).fill(0)
  if (!notation || notation === 'empty') return { dark, light }
  const pairs = notation.split(',')
  for (const pair of pairs) {
    const [posStr, countSymbol] = pair.split(':')
    if (!countSymbol || posStr === 'home' || posStr === 'bar') continue
    const pos = parseInt(posStr, 10)
    const match = countSymbol.match(/^(\d+)([WB])$/)
    if (!match) continue
    const count = parseInt(match[1], 10)
    const owner = match[2]
    if (owner === 'W') light[pos] = count
    else dark[pos] = count
  }
  return { dark, light }
}

function buildDraughtsFenFromSetup(rows, cols, setup) {
  const setupRows = setup.rows
  const darkOnly = setup.dark !== false
  const fenRows = []
  for (let r = 0; r < rows; r++) {
    let row = ''
    let empty = 0
    for (let c = 0; c < cols; c++) {
      const isDark = (r + c) % 2 === 1
      const isBlackZone = r < setupRows
      const isWhiteZone = r >= rows - setupRows
      const playable = !darkOnly || isDark
      if (playable && isBlackZone) {
        if (empty > 0) { row += empty > 9 ? String(empty) : String(empty); empty = 0 }
        row += 'b'
      } else if (playable && isWhiteZone) {
        if (empty > 0) { row += String(empty); empty = 0 }
        row += 'w'
      } else {
        empty++
      }
    }
    if (empty > 0) row += String(empty)
    fenRows.push(row)
  }
  return fenRows.join('/')
}

function fen4ToPosition(fen4, rows, cols) {
  const position = {}
  const ranks = fen4.split('/')
  for (let r = 0; r < ranks.length && r < rows; r++) {
    let c = 0
    const cells = ranks[r].split(',')
    for (const cell of cells) {
      const trimmed = cell.trim()
      if (/^\d+$/.test(trimmed)) {
        c += parseInt(trimmed, 10)
      } else {
        const file = String.fromCharCode(97 + c)
        const rankNum = rows - r
        position[`${file}${rankNum}`] = trimmed
        c++
      }
    }
  }
  return position
}

const FEN4_OWNERS = { r: 'red', b: 'blue', y: 'yellow', g: 'green' }

function fen4GetOwner(pieceType) {
  if (pieceType.length >= 2) return FEN4_OWNERS[pieceType[0]] || 'white'
  return pieceType === pieceType.toUpperCase() ? 'white' : 'black'
}

const recolourCache = {}

async function loadRecolouredPieces(config, gallery) {
  const setDef = gallery?.find(s => s.id === (config.pieceSet4 || 'mce-4player'))
  if (!setDef || !setDef.owners || !setDef.baseSet) return

  const basePath = `../pieces/sets/${setDef.baseSet}/`
  const images = {}
  const owners = setDef.owners
  const matchColor = setDef.recolourMatch || '#fff'

  const fetches = []
  for (const [pieceId, filename] of Object.entries(setDef.pieces || {})) {
    const ownerPrefix = pieceId[0]
    const ownerName = FEN4_OWNERS[ownerPrefix]
    const ownerColors = owners[ownerName]
    if (!ownerColors) continue

    const cacheKey = `${setDef.baseSet}/${filename}:${ownerColors.fill}`
    if (recolourCache[cacheKey]) {
      images[pieceId] = recolourCache[cacheKey]
      continue
    }

    fetches.push(
      fetch(basePath + filename).then(r => r.text()).then(svg => {
        const tinted = svg.replaceAll(matchColor, ownerColors.fill)
        const dataUri = 'data:image/svg+xml,' + encodeURIComponent(tinted)
        recolourCache[cacheKey] = dataUri
        images[pieceId] = dataUri
      }).catch(() => {})
    )
  }

  await Promise.all(fetches)
  config.pieceImages = images
}

function parseDraughtsFen(fen, rows, cols, vocabulary) {
  const vocab = vocabulary || DRAUGHTS_VOCABULARY
  const position = {}
  const ranks = fen.split('/')
  for (let r = 0; r < ranks.length; r++) {
    let c = 0, i = 0
    const rank = ranks[r]
    while (i < rank.length) {
      const ch = rank[i]
      if (ch >= '0' && ch <= '9') {
        const next = rank[i + 1]
        if (next >= '0' && next <= '9') { c += parseInt(ch + next, 10); i += 2 }
        else { c += parseInt(ch, 10); i++ }
      } else {
        if (vocab[ch]) {
          const file = String.fromCharCode(97 + c)
          const rankNum = rows - r
          position[`${file}${rankNum}`] = { ...vocab[ch] }
        }
        c++; i++
      }
    }
  }
  return position
}

function getHandicapPoints(rows) {
  const off = rows <= 9 ? 2 : 3
  const mid = Math.floor((rows - 1) / 2)
  const far = rows - 1 - off
  // Standard placement order: opposing corners, remaining corners, sides, tengen
  return [
    [off, far], [far, off],
    [off, off], [far, far],
    [mid, off], [mid, far],
    [off, mid], [far, mid],
    [mid, mid],
  ]
}

function buildGoHandicap(count, rows) {
  const points = getHandicapPoints(rows).slice(0, count)
  const position = {}
  const GO_LETTERS = 'abcdefghjklmnopqrst'
  for (const [r, c] of points) {
    const file = GO_LETTERS[c]
    const rank = rows - r
    position[`${file}${rank}`] = { type: 'stone', color: 'black' }
  }
  return position
}

function buildFanoronaPosition(rows, cols) {
  const position = {}
  const midRow = Math.floor(rows / 2)
  const midCol = Math.floor(cols / 2)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const file = String.fromCharCode(97 + c)
      const rank = rows - r
      const sq = `${file}${rank}`
      if (r < midRow) {
        position[sq] = { type: 'stone', color: 'white' }
      } else if (r > midRow) {
        position[sq] = { type: 'stone', color: 'black' }
      } else if (c < midCol) {
        position[sq] = { type: 'stone', color: 'white' }
      } else if (c > midCol) {
        position[sq] = { type: 'stone', color: 'black' }
      }
    }
  }
  return position
}

// ─── APP STATE ──────────────────────────────────────────────────────────────

let state = readStateFromURL()
let galleryIndex = null

const boardDataCache = {}

function readStateFromURL() {
  const params = new URLSearchParams(window.location.search)
  return {
    game: params.get('game') || 'moddable-chess',
    variant: params.get('variant') || 'standard',
    handicap: parseInt(params.get('handicap')) || 0,
    seed: params.get('seed') || String(Math.floor(Math.random() * 9999999999)),
    style: params.get('style') || 'classic',
    players: parseInt(params.get('players')) || 0,
  }
}

function pushState() {
  const params = new URLSearchParams({ game: state.game, variant: state.variant })
  if (state.handicap) params.set('handicap', state.handicap)
  if (state.seed) params.set('seed', state.seed)
  if (state.style && state.style !== 'classic') params.set('style', state.style)
  if (state.players) params.set('players', state.players)
  history.replaceState(null, '', '?' + params.toString())
}

let gamesIndex = {}

async function init() {
  galleryIndex = await fetch('../pieces/gallery-index.json').then(r => r.json()).catch(e => { console.error('Gallery load failed:', e); return null })
  const manifest = await fetch('../../moddable-rules/diagrams-manifest.json').then(r => r.json()).catch(e => { console.error('Manifest load failed:', e); return {} })
  for (const key of Object.keys(manifest)) {
    const [family, variant] = key.split('/')
    if (!gamesIndex[family]) gamesIndex[family] = []
    gamesIndex[family].push(variant)
  }
  populateGames()
  populateVariants()
  bindControls()
  render()
}

function populateGames() {
  const select = document.getElementById('game-select')
  select.innerHTML = ''
  const sorted = Object.keys(gamesIndex).sort()
  for (const id of sorted) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id.replace(/-/g, ' ')
    select.appendChild(opt)
  }
  select.value = state.game
}

function populateVariants() {
  const select = document.getElementById('variant-select')
  select.innerHTML = ''
  const variants = gamesIndex[state.game]
  if (!variants) return
  for (const id of variants) {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = id.replace(/-/g, ' ')
    select.appendChild(opt)
  }
  select.value = state.variant
  updateCoverage()
}

function updateCoverage() {
  const variants = gamesIndex[state.game]
  if (!variants) return
  const el = document.getElementById('coverage-info')
  if (el) el.textContent = `${variants.length} variants`
}

function bindControls() {

  document.getElementById('game-select').addEventListener('change', e => {
    state.game = e.target.value
    const variants = gamesIndex[state.game]
    state.variant = variants ? variants[0] : ''
    populateVariants()
    pushState()
    render()
  })
  document.getElementById('variant-select').addEventListener('change', e => {
    state.variant = e.target.value
    pushState()
    render()
  })
  document.getElementById('handicap-select').addEventListener('change', e => {
    state.handicap = parseInt(e.target.value) || 0
    pushState()
    render()
  })
  document.getElementById('hex-style-select').addEventListener('change', e => {
    state.style = e.target.value
    pushState()
    render()
  })
  document.getElementById('hex-players-select').addEventListener('change', e => {
    state.players = parseInt(e.target.value) || 0
    pushState()
    render()
  })
  let seedTimer = null
  document.getElementById('hex-seed-input').addEventListener('input', e => {
    clearTimeout(seedTimer)
    seedTimer = setTimeout(() => {
      state.seed = e.target.value || String(Math.floor(Math.random() * 9999999999))
      pushState()
      render()
    }, 300)
  })
  document.getElementById('hex-reseed-btn').addEventListener('click', () => {
    state.seed = String(Math.floor(Math.random() * 9999999999))
    document.getElementById('hex-seed-input').value = state.seed
    pushState()
    render()
  })
  window.addEventListener('resize', () => requestAnimationFrame(fitToView))

  document.getElementById('export-svg-btn').addEventListener('click', exportSvg)
  document.getElementById('export-png-btn').addEventListener('click', exportPng)
}

function exportSvg() {
  const container = document.getElementById('board-svg')
  const svg = container.querySelector('svg')
  if (!svg) return
  const svgString = new XMLSerializer().serializeToString(svg)
  const blob = new Blob([svgString], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${state.game}-${state.variant}.svg`
  a.click()
  URL.revokeObjectURL(url)
}

async function exportPng() {
  const container = document.getElementById('board-svg')
  const svg = container.querySelector('svg')
  if (!svg) return

  // Get actual dimensions from viewBox (most reliable source)
  const vb = svg.getAttribute('viewBox')
  let svgW, svgH
  if (vb) {
    const parts = vb.split(/[\s,]+/).map(Number)
    svgW = parts[2]
    svgH = parts[3]
  } else {
    svgW = parseInt(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 400
    svgH = parseInt(svg.getAttribute('height')) || svg.getBoundingClientRect().height || 400
  }

  const scale = 2
  const width = svgW * scale
  const height = svgH * scale

  // Clone and ensure explicit width/height so Image renders at full size
  const clone = svg.cloneNode(true)
  clone.setAttribute('width', svgW)
  clone.setAttribute('height', svgH)
  clone.removeAttribute('style')
  await inlineExternalImages(clone)

  const svgString = new XMLSerializer().serializeToString(clone)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')

  const img = new Image()
  img.onload = () => {
    ctx.drawImage(img, 0, 0, width, height)
    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${state.game}-${state.variant}.png`
      a.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  img.src = URL.createObjectURL(blob)
}

async function inlineExternalImages(svgEl) {
  const images = svgEl.querySelectorAll('image[href]')
  const promises = [...images].map(async img => {
    const href = img.getAttribute('href')
    if (!href || href.startsWith('data:')) return
    try {
      const resp = await fetch(href)
      const blob = await resp.blob()
      const dataUrl = await new Promise(resolve => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.readAsDataURL(blob)
      })
      img.setAttribute('href', dataUrl)
    } catch (e) {
      // Leave as-is if fetch fails
    }
  })
  await Promise.all(promises)
}

function getStaticSvgPath(gameId, variantId) {
  const STATIC_PATH_OVERRIDES = {
    'landlords-game/standard': 'landlords-game-board.svg',
    'halma/standard-2p': 'halma-2p-board.svg',
    'halma/standard-4p': 'halma-4p-board.svg',
    'stern-halma/standard': 'stern-halma-board.svg',
    'royal-ur/standard': 'royal-ur-board.svg',
    'surakarta/standard': 'surakarta-board.svg',
    'pachisi/standard': 'pachisi-board.svg',
    'chaupar/standard': 'chaupar-board.svg',
    'hex/standard': 'hex-board.svg',
    'landlords-game/1904-original': '1904-original-board.svg',
    'landlords-game/1906-commercial': '1906-commercial-board.svg',
  }
  const key = `${gameId}/${variantId}`
  const filename = STATIC_PATH_OVERRIDES[key] || `${variantId}-board.svg`
  return `../diagrams/static/${gameId}/${filename}`
}

export function renderMultiBoard(config, game) {
  const { layers } = config
  const { count, layout, labels, fens, colors: layerColors } = layers
  const gap = layout === 'horizontal' ? 20 : 12
  const labelH = 18

  const ts = config.tileSize || 34
  const rows = config.rows || 8
  const cols = config.cols || 8
  const innerPad = 24
  const boardW = cols * ts + innerPad * 2
  const boardH = rows * ts + innerPad * 2
  const pad = 4

  let totalW, totalH
  if (layout === 'horizontal') {
    totalW = count * boardW + (count - 1) * gap + pad * 2
    totalH = boardH + pad * 2 + labelH
  } else {
    totalW = boardW + pad * 2
    totalH = count * (boardH + labelH) + (count - 1) * gap + pad * 2
  }

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">`)
  const bgColor = config.background || 'transparent'
  if (bgColor !== 'transparent') {
    parts.push(`<rect width="${totalW}" height="${totalH}" fill="${bgColor}" rx="6"/>`)
  }

  for (let i = 0; i < count; i++) {
    let ox, oy
    if (layout === 'horizontal') {
      ox = pad + i * (boardW + gap)
      oy = pad + labelH
    } else {
      ox = pad
      oy = pad + i * (boardH + labelH + gap)
    }

    // Layer label
    const labelX = ox + boardW / 2
    const labelY = oy - 4
    const labelColor = bgColor === 'transparent' ? '#333' : '#aaa'
    parts.push(`<text x="${labelX}" y="${labelY}" text-anchor="middle" font-size="11" fill="${labelColor}" font-family="system-ui">${labels[i] || 'Board ' + (i + 1)}</text>`)

    // Build per-layer config and render through consolidated pipeline
    const boardColors = layerColors && layerColors[i]
      ? { lightSquare: layerColors[i].lightSquare || '#f0d9b5', darkSquare: layerColors[i].darkSquare || '#b58863' }
      : config.colors || {}
    const fen = fens && fens[i]
    const position = fen ? fenToPosition(fen, rows, cols) : {}

    const layerConfig = {
      ...config,
      rows, cols, tileSize: ts,
      colors: boardColors,
      position,
      layers: undefined,
    }

    // Use consolidated grid renderer per layer
    const layerSvg = renderBoard(layerConfig)
    // Extract inner SVG content (strip outer <svg> and </svg> tags)
    const innerStart = layerSvg.indexOf('>') + 1
    const innerEnd = layerSvg.lastIndexOf('</svg>')
    const innerContent = layerSvg.slice(innerStart, innerEnd)

    parts.push(`<g transform="translate(${ox},${oy})">`)
    parts.push(innerContent)
    parts.push('</g>')
  }

  parts.push('</svg>')
  return parts.join('\n')
}

async function render() {
  if (!state.game || !state.variant) return
  const basePath = '../../moddable-rules/games/'
  const familyPath = state.game + '/content/rulebook.md'
  const variantPath = state.game + '/content/variants/' + state.variant + '.md'

  try {
    const { resolved, errors } = await loadVariant({ familyPath, variantPath, basePath })
    if (errors && errors.length > 0) {
      showSvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="200" y="40" text-anchor="middle" font-size="12" fill="#f44">' + errors.join('; ') + '</text></svg>')
      return
    }
    const target = document.getElementById('board-svg')
    await renderFromResolved(resolved, target)
    target.classList.add('active')
    document.getElementById('board-empty').style.display = 'none'
    requestAnimationFrame(fitToView)
  } catch (e) {
    showSvg('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="80"><text x="200" y="40" text-anchor="middle" font-size="12" fill="#f44">' + e.message + '</text></svg>')
  }
}

function renderHexGame(game, variantDef) {
  const gameConfig = getGameConfig(game.hexGame)
  if (!gameConfig) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">No generator: "${game.hexGame}"</text></svg>`)
    return
  }

  const size = variantDef.hexSize || gameConfig.defaultSize
  const players = state.players || gameConfig.defaultPlayers || 0
  const seed = state.seed
  const style = state.style || 'classic'
  const layout = variantDef.hexLayout || null

  const hexes = gameConfig.generate(size, players, seed, layout)
  if (!hexes || hexes.length === 0) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">Empty map</text></svg>`)
    return
  }

  const colors = gameConfig.getColors ? gameConfig.getColors() : {}
  const images = gameConfig.getImages ? gameConfig.getImages(style) : null
  const rendererOpts = gameConfig.rendererOptions ? gameConfig.rendererOptions() : {}

  const hasPerHexImages = images && images._perHex
  const hasTypeImages = images && !images._perHex

  const svgOpts = {
    hexSize: rendererOpts.hexSize || 40,
    flat: rendererOpts.flat || gameConfig.orientation === 'flat',
    colors,
    images: (style !== 'classic' && hasTypeImages) ? images : null,
    imageMode: (style !== 'classic' && (hasTypeImages || hasPerHexImages)) ? 'href' : 'none',
    strokeColor: 'rgba(0,0,0,0.3)',
    strokeWidth: 1,
    padding: 15,
    scaleFactor: 0.95,
    labels: gameConfig.labels !== false,
    bgColor: null,
  }

  const svg = HexSvg.toSVG(hexes, svgOpts)
  showSvg(svg)
  showInfo({
    hexGame: game.hexGame,
    hexSize: size,
    hexCount: hexes.length,
    seed,
    style,
    label: variantDef.label,
  })
  bindHexHover(gameConfig)
  requestAnimationFrame(fitToView)
}

function renderHexGameConsolidated(game, variantDef) {
  const gameConfig = getGameConfig(game.hexGame)
  if (!gameConfig) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">No generator: "${game.hexGame}"</text></svg>`)
    return
  }

  const size = variantDef.hexSize || gameConfig.defaultSize
  const players = state.players || gameConfig.defaultPlayers || 0
  const seed = state.seed
  const style = state.style || 'classic'
  const layout = variantDef.hexLayout || null

  const hexes = gameConfig.generate(size, players, seed, layout)
  if (!hexes || hexes.length === 0) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="60"><text x="100" y="35" text-anchor="middle" font-size="12" fill="#888">Empty map</text></svg>`)
    return
  }

  const colors = gameConfig.getColors ? gameConfig.getColors() : {}
  const images = gameConfig.getImages ? gameConfig.getImages(style) : null
  const rendererOpts = gameConfig.rendererOptions ? gameConfig.rendererOptions() : {}
  const flat = rendererOpts.flat || gameConfig.orientation === 'flat'
  const cellSize = rendererOpts.hexSize || 40

  const hasPerHexImages = images && images._perHex
  const hasTypeImages = images && !images._perHex
  const useImages = style !== 'classic' && (hasTypeImages || hasPerHexImages)

  let cellImage = null
  if (useImages) {
    if (hasPerHexImages) {
      cellImage = (q, r, hex) => hex.imagePath || null
    } else if (hasTypeImages) {
      cellImage = (q, r, hex) => images[hex.type] || null
    }
  }

  const config = {
    label: variantDef.label,
    layout: {
      hexes,
      orientation: flat ? 'flat' : 'pointy',
      cellSize,
      scale: 0.95,
      background: null,
      frame: null,
      cellFill: (q, r, hex) => colors[hex.type] || '#666',
      cellStroke: { color: 'rgba(0,0,0,0.3)', width: 1 },
      cellImage,
      cellLabel: gameConfig.labels !== false ? (q, r, hex) => hex.label || null : null,
      overlays: hexes.filter(h => h.overlay).map(h => ({
        q: h.q, r: h.r,
        color: h.overlay.color || '#C62828',
        text: h.overlay.text || null,
        radius: h.overlay.size || 0.35,
      })),
    },
  }

  const svg = renderBoard(config)
  showSvg(svg)
  showInfo({
    hexGame: game.hexGame,
    hexSize: size,
    hexCount: hexes.length,
    seed,
    style,
    label: variantDef.label,
  })
  bindHexHover(gameConfig)
  requestAnimationFrame(fitToView)
}

function renderDeckGame(game, variantDef) {
  const deckType = game.deckGame
  const deckConfig = getDeckConfig(deckType)
  if (!deckConfig) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="100" text-anchor="middle" font-size="14" fill="#888" font-family="system-ui">Unknown deck: "${deckType}"</text></svg>`)
    return
  }

  const gameKey = variantDef.deckVariant
  const dealSpec = deckConfig.games[gameKey]
  if (!dealSpec) {
    showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="100" text-anchor="middle" font-size="14" fill="#888" font-family="system-ui">No deal spec: "${gameKey}"</text></svg>`)
    return
  }

  const seed = state.seed
  const players = state.players || dealSpec.defaultPlayers
  const activeDealSpec = { ...dealSpec, players }
  const createOpts = deckType === 'standard-dice'
    ? { count: (dealSpec.perPlayer || 0) * players + (dealSpec.community || 0) }
    : dealSpec
  const cards = createDeck(deckType, createOpts)
  const shuffled = shuffle(cards, seed)
  const dealResult = deal(shuffled, activeDealSpec)

  if (deckType === 'standard-dice' && deckConfig.roll) {
    for (let i = 0; i < dealResult.hands.length; i++) {
      dealResult.hands[i] = deckConfig.roll(dealResult.hands[i], seed + i)
    }
    if (dealResult.community.length > 0) {
      dealResult.community = deckConfig.roll(dealResult.community, seed + 99)
    }
  }

  if (dealResult.layout === 'tableau') {
    renderTableauSvg(dealResult, { deckType, deckConfig, variantDef, seed })
    return
  }

  if (activeDealSpec.layout === 'mahjong-wall') {
    renderMahjongSvg(dealResult, { deckType, deckConfig, variantDef, seed, tileSet: activeDealSpec.tileSet || 'mahjong-regular' })
    return
  }

  const cardW = deckType === 'dominoes-28' ? 32 : deckType === 'standard-dice' ? 48 : 44
  const cardH = deckType === 'dominoes-28' ? 60 : deckType === 'standard-dice' ? 48 : 64
  const maxHand = Math.max(...dealResult.hands.map(h => h.length), dealResult.community.length)
  const handWidth = maxHand * (cardW + 4)
  const handHalfW = handWidth / 2
  const handHalfH = cardH / 2
  const separationNeeded = handWidth + 20
  const minRingFromSeparation = separationNeeded / (2 * Math.sin(Math.PI / players))
  const communityWidth = dealResult.community.length * (cardW + 4)
  const hasDrawPile = dealResult.drawPile.length > 0
  const drawPileWidth = hasDrawPile ? cardW + 8 : 0
  const centreZoneHalfW = (communityWidth + drawPileWidth) / 2
  const minRingFromCommunity = centreZoneHalfW + handHalfW + 20
  const minRing = Math.max(minRingFromSeparation, minRingFromCommunity, 150)

  const tableW = (minRing + handHalfW) * 2 + 40
  const tableH = (minRing + handHalfH) * 2 + 60

  const tableLayout = layoutTable(dealResult, {
    players,
    tableWidth: tableW,
    tableHeight: tableH,
    cardW,
    cardH,
    handStyle: 'spread',
  })

  const svg = renderDeckSvg(tableLayout, {
    tableW, tableH, cardW, cardH,
    deckLabel: deckConfig.label,
    gameLabel: variantDef.label,
    deckType,
    seed,
  })

  const notation = encodeDeckState(dealResult, deckType, seed, players)

  showSvg(svg)
  showInfo({
    deckType,
    gameKey,
    seed,
    players,
    cardsPerHand: dealResult.hands[0]?.length || 0,
    community: dealResult.community.length,
    drawPile: dealResult.drawPile.length,
    label: variantDef.label,
    setupDesc: variantDef.setupDesc,
    variantDesc: variantDef.variantDesc,
    deckNotation: notation,
  })
  bindDeckHover()
  requestAnimationFrame(fitToView)
}

function encodeDeckState(dealResult, deckType, seed, players) {
  const parts = [`${deckType}:${seed}:${players}`]
  for (let i = 0; i < dealResult.hands.length; i++) {
    const ids = dealResult.hands[i].map(c => c.id)
    parts.push(`h${i}=${ids.join(',')}`)
  }
  if (dealResult.community.length > 0) {
    parts.push(`f=${dealResult.community.map(c => c.id).join(',')}`)
  }
  parts.push(`d=${dealResult.drawPile.length}`)
  return parts.join('|')
}

function bindDeckHover() {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a card or zone'

  svgContainer.addEventListener('mouseover', e => {
    const card = e.target.closest('[data-card]')
    const zone = e.target.closest('[data-zone]')
    if (card && zone) {
      infoBar.textContent = `${card.dataset.card} · ${zone.dataset.zone}`
    } else if (card) {
      infoBar.textContent = card.dataset.card
    } else if (zone) {
      infoBar.textContent = zone.dataset.zone
    }
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a card or zone'
  })
}

export function renderDeckSvg(layout, opts) {
  const { tableW, tableH, cardW, cardH, deckLabel, gameLabel, deckType, seed } = opts
  const pad = 20
  const w = tableW + pad * 2
  const h = tableH + pad * 2
  const parts = []

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${pad}" y="${pad}" width="${tableW}" height="${tableH}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)

  for (const hand of layout.hands) {
    const zoneDesc = hand.cards[0]?.faceUp ? `${hand.label} — ${hand.cards.length} cards (visible)` : `${hand.label} — ${hand.cards.length} cards (hidden)`
    parts.push(`<g class="hand" data-zone="${zoneDesc}">`)
    for (const pos of hand.cards) {
      parts.push(renderCard(pos, cardW, cardH, pad, deckType))
    }
    const midIdx = Math.floor(hand.cards.length / 2)
    const labelX = hand.cards.length > 0 ? (hand.cards[0].x + hand.cards[hand.cards.length - 1].x) / 2 + pad : tableW / 2 + pad
    const labelY = hand.cards.length > 0 ? hand.cards[0].y + pad : tableH / 2 + pad
    const isBottom = labelY > tableH / 2 + pad
    const labelOffset = isBottom ? cardH / 2 + 14 : -cardH / 2 - 6
    parts.push(`<text x="${labelX}" y="${labelY + labelOffset}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.6)" font-family="system-ui">${hand.label} (${hand.cards.length})</text>`)
    parts.push('</g>')
  }

  if (layout.community && layout.community.length > 0) {
    parts.push(`<g class="community" data-zone="Community / Field — ${layout.community.length} cards (face up)">`)
    for (const pos of layout.community) {
      parts.push(renderCard(pos, cardW, cardH, pad, deckType))
    }
    const cy = layout.community[0].y + pad + cardH / 2 + 14
    parts.push(`<text x="${tableW / 2 + pad}" y="${cy}" text-anchor="middle" font-size="10" fill="rgba(255,255,255,0.5)" font-family="system-ui">Field (${layout.community.length})</text>`)
    parts.push('</g>')
  }

  if (layout.drawPile && layout.drawPile.length > 0) {
    const dp = layout.drawPile[0]
    const dx = dp.x + pad
    const dy = dp.y + pad
    const count = dp.count || layout.drawPile.length
    const backPath = getCardBackPath(deckType)
    parts.push(`<g data-zone="Draw pile — ${count} cards remaining (face down)">`)
    const stackDepth = Math.min(4, count)
    for (let s = stackDepth - 1; s >= 0; s--) {
      const sx = dx - s * 1.5
      const sy = dy - s * 1.5
      if (backPath) {
        parts.push(`<image href="${backPath}" x="${sx - cardW / 2}" y="${sy - cardH / 2}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/>`)
      } else {
        parts.push(`<rect x="${sx - cardW / 2}" y="${sy - cardH / 2}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"/>`)
      }
    }
    parts.push(`<text x="${dx}" y="${dy + 3}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.85)" font-family="system-ui" font-weight="bold">${count}</text>`)
    parts.push('</g>')
  }

  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckLabel} · ${gameLabel} · seed: ${seed !== undefined ? seed : ''}</text>`)
  parts.push('</svg>')
  return parts.join('\n')
}

function getCardImagePath(card, deckType, opts) {
  if (deckType === 'standard-52') {
    if (card.suit === 'joker') return `../pieces/sets/letele-cards/J-1.svg`
    const suitLetter = { spades: 'S', hearts: 'H', clubs: 'C', diamonds: 'D' }[card.suit]
    const rank = card.rank === '10' ? '10' : card.rank
    return `../pieces/sets/letele-cards/${suitLetter}-${rank}.svg`
  }
  if (deckType === 'hanafuda-48') {
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const month = monthNames[card.monthIndex]
    const type = card.type.charAt(0).toUpperCase() + card.type.slice(1)
    const name = card.name
    if (name.match(/Plain \d/)) {
      return `../pieces/sets/hanafuda-traditional/Hanafuda_${month}_${type}_${name.slice(-1)}_Alt.svg`
    }
    return `../pieces/sets/hanafuda-traditional/Hanafuda_${month}_${type}_Alt.svg`
  }
  if (deckType === 'bavarian-32') {
    const suitMap = { acorns: 'eichel', leaves: 'blatt', hearts: 'hart', bells: 'schellen' }
    const suit = suitMap[card.suit]
    const faceMap = {
      eichel: { 'U': '11_unter', 'O': '12_ober', 'K': '13_konig', 'A': '01_daus' },
      hart:   { 'U': '11_unter', 'O': '12_ober', 'K': '13_konig', 'A': '01_daus' },
      blatt:  { 'U': '11_jack', 'O': '12_queen', 'K': '13_king', 'A': '01_daus' },
      schellen: { 'U': '11_jack', 'O': '12_queen', 'K': '13_king', 'A': '01' },
    }
    const numericMap = { '7': '07', '8': '08', '9': '09', '10': '10' }
    const rank = faceMap[suit]?.[card.rank] || numericMap[card.rank] || card.rank
    return `../pieces/sets/mfrasca-skat/Playing_card-german-${suit}-${rank}.svg`
  }
  if (deckType === 'mahjong-136') {
    if (opts?.tileSet === 'mahjong-planar') {
      const suitFileMap = { bamboo: 'tiao', circles: 'bing', characters: 'wan' }
      const windFileMap = { east: 'Eastwind', south: 'Southwind', west: 'Westwind', north: 'Northwind' }
      const dragonFileMap = { red: 'Reddragon', green: 'Greendragon', white: 'Whitedragon' }
      const flowerFileMap = { 1: 'mei', 2: 'lan', 3: 'ju', 4: 'zhu' }
      const seasonFileMap = { 1: 'spring', 2: 'summer', 3: 'autumn', 4: 'winter' }
      if (card.suit === 'wind') return `../pieces/sets/mahjong-planar/MJ${windFileMap[card.rank]}.svg`
      if (card.suit === 'dragon') return `../pieces/sets/mahjong-planar/MJ${dragonFileMap[card.rank]}.svg`
      if (card.suit === 'flower') return `../pieces/sets/mahjong-planar/MJ${flowerFileMap[card.rank]}.svg`
      if (card.suit === 'season') return `../pieces/sets/mahjong-planar/MJ${seasonFileMap[card.rank]}.svg`
      if (suitFileMap[card.suit]) return `../pieces/sets/mahjong-planar/MJ${card.rank}${suitFileMap[card.suit]}.svg`
      return null
    }
    const suitFileMap = { bamboo: 'Sou', circles: 'Pin', characters: 'Man' }
    const windFileMap = { east: 'Ton', south: 'Nan', west: 'Shaa', north: 'Pei' }
    const dragonFileMap = { red: 'Chun', green: 'Hatsu', white: 'Haku' }
    if (card.suit === 'wind') return `../pieces/sets/mahjong-regular/${windFileMap[card.rank]}.svg`
    if (card.suit === 'dragon') return `../pieces/sets/mahjong-regular/${dragonFileMap[card.rank]}.svg`
    if (suitFileMap[card.suit]) return `../pieces/sets/mahjong-regular/${suitFileMap[card.suit]}${card.rank}.svg`
    return null
  }
  if (deckType === 'standard-dice') {
    const valueNames = { 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' }
    const name = valueNames[card.value]
    if (name) return `../pieces/sets/playstrategy-backgammon/wdice${name}.svg`
    return `../pieces/sets/playstrategy-backgammon/wdicerandom.svg`
  }
  if (deckType === 'dominoes-28') {
    const a = String(card.low).padStart(2, '0')
    const b = String(card.high).padStart(2, '0')
    return `../pieces/sets/dominoes-classic/domino-${a}-${b}.svg`
  }
  return null
}

function getCardBackPath(deckType) {
  if (deckType === 'standard-52') return `../pieces/sets/letele-cards/B-1.svg`
  if (deckType === 'mahjong-136') return `../pieces/sets/mahjong-regular/Back.svg`
  if (deckType === 'dominoes-28') return `../pieces/sets/dominoes-classic/domino-back.svg`
  return null
}

function renderCard(pos, cardW, cardH, pad, deckType) {
  const x = pos.x + pad - cardW / 2
  const y = pos.y + pad - cardH / 2
  const rot = pos.rot ? ` transform="rotate(${pos.rot.toFixed(1)} ${pos.x + pad} ${pos.y + pad})"` : ''
  const cardLabel = pos.card?.display || pos.card?.id || '?'

  const tileBgDecks = new Set(['mahjong-136', 'dominoes-28'])
  const needsTileBg = tileBgDecks.has(deckType)

  if (!pos.faceUp) {
    const backPath = getCardBackPath(deckType)
    if (backPath && needsTileBg) {
      const inset = 3
      return `<g${rot} data-card="Face down"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${backPath}" x="${x + inset}" y="${y + inset}" width="${cardW - inset * 2}" height="${cardH - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    if (backPath) {
      return `<g${rot} data-card="Face down"><image href="${backPath}" x="${x}" y="${y}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    return `<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"${rot} data-card="Face down"/>`
  }

  const card = pos.card
  const imgPath = getCardImagePath(card, deckType)

  if (imgPath) {
    if (needsTileBg) {
      const inset = 3
      return `<g${rot} data-card="${cardLabel}"><rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${imgPath}" x="${x + inset}" y="${y + inset}" width="${cardW - inset * 2}" height="${cardH - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`
    }
    return `<g${rot} data-card="${cardLabel}"><image href="${imgPath}" x="${x}" y="${y}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`
  }

  const parts = []
  parts.push(`<g${rot} data-card="${cardLabel}">`)
  parts.push(`<rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" fill="#fff" rx="3" stroke="#ccc" stroke-width="0.5"/>`)
  const fs = Math.min(cardW * 0.3, 10)
  parts.push(`<text x="${x + cardW / 2}" y="${y + cardH / 2 + fs * 0.35}" text-anchor="middle" font-size="${fs}" fill="#333" font-family="system-ui">${card.display || '?'}</text>`)
  parts.push('</g>')
  return parts.join('')
}

export function renderMahjongSvg(dealResult, opts) {
  const { deckType, deckConfig, variantDef, seed, tileSet } = opts
  const tileW = 30
  const tileH = 40
  const tileGap = 2
  const stackOffset = 3
  const pad = 20
  const outerPad = 20

  const wallTiles = dealResult.drawPile.length
  const totalStacks = Math.ceil(wallTiles / 2)
  const stacksPerSide = Math.ceil(totalStacks / 4)
  const step = tileW + tileGap
  const wallLen = stacksPerSide * step
  const wallSquare = wallLen + 2 * tileH

  const handSize = Math.max(...dealResult.hands.map(h => h.length))
  const handLen = handSize * step
  const totalSize = Math.max(wallSquare + 140, handLen + 2 * (pad + tileH) + 40)

  const w = totalSize + outerPad * 2
  const h = w

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${outerPad}" y="${outerPad}" width="${totalSize}" height="${totalSize}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)
  parts.push(`<g transform="translate(${outerPad},${outerPad})">`)

  const cx = totalSize / 2
  const cy = totalSize / 2
  const halfSquare = wallSquare / 2

  const breakPoint = (seed % totalStacks)
  const windNames = ['South', 'East', 'North', 'West']

  let stackCount = 0
  for (let side = 0; side < 4; side++) {
    const sideStacks = Math.min(stacksPerSide, totalStacks - stackCount)
    const tilesOnSide = Math.min(sideStacks * 2, wallTiles - stackCount * 2)
    const isLiveEnd = breakPoint >= stackCount && breakPoint < stackCount + sideStacks
    const startIdx = stackCount
    const zoneLabel = `Wall — ${windNames[side]} side · ${tilesOnSide} tiles (${sideStacks} stacks of 2)${isLiveEnd ? ' · draw from here' : ''}`
    parts.push(`<g data-zone="${zoneLabel}">`)

    for (let i = 0; i < sideStacks; i++) {
      const globalIdx = startIdx + i
      const remaining = wallTiles - globalIdx * 2
      const height = Math.min(2, remaining)
      let tx, ty, rw, rh

      // Four equal-length walls, each centred on its side, small corner gaps
      const half = wallLen / 2
      const inset = half + tileH
      if (side === 0) {
        tx = cx - half + i * step
        ty = cy + inset - tileH
        rw = tileW; rh = tileH
      } else if (side === 1) {
        tx = cx + inset - tileH
        ty = cy + half - (i + 1) * step
        rw = tileH; rh = tileW
      } else if (side === 2) {
        tx = cx + half - (i + 1) * step
        ty = cy - inset
        rw = tileW; rh = tileH
      } else {
        tx = cx - inset
        ty = cy - half + i * step
        rw = tileH; rh = tileW
      }

      const soX = side === 1 ? -stackOffset : side === 3 ? stackOffset : 0
      const soY = side === 0 ? -stackOffset : side === 2 ? stackOffset : 0
      parts.push(`<g data-card="Stack ${globalIdx + 1} · ${height} tile${height > 1 ? 's' : ''} high${globalIdx === breakPoint ? ' · BREAK' : ''}">`)
      if (height === 2) {
        parts.push(`<rect x="${tx + soX}" y="${ty + soY}" width="${rw}" height="${rh}" fill="#d4c9a8" rx="3" stroke="#a89060" stroke-width="0.5"/>`)
      }
      parts.push(`<rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="3" stroke="#bbb" stroke-width="0.6"/>`)
      if (globalIdx === breakPoint) {
        parts.push(`<rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="none" rx="3" stroke="#ffcc00" stroke-width="1.5"/>`)
      }
      parts.push('</g>')
    }
    parts.push('</g>')
    stackCount += sideStacks
  }

  const playerLabels = ['South (you)', 'East', 'North', 'West']
  for (let p = 0; p < 4; p++) {
    const hand = dealResult.hands[p]
    const faceUp = p === 0
    const label = playerLabels[p]
    const zoneDesc = faceUp ? `${label} — ${hand.length} tiles (visible)` : `${label} — ${hand.length} tiles (hidden)`
    parts.push(`<g data-zone="${zoneDesc}">`)

    for (let i = 0; i < hand.length; i++) {
      const card = hand[i]
      const cardLabel = faceUp ? (card.display || card.id) : 'Face down'
      let tx, ty

      if (p === 0) {
        tx = cx - (hand.length * (tileW + tileGap)) / 2 + i * (tileW + tileGap)
        ty = totalSize - pad - tileH
      } else if (p === 1) {
        tx = totalSize - pad - tileH
        ty = cy + (hand.length * (tileW + tileGap)) / 2 - (i + 1) * (tileW + tileGap)
      } else if (p === 2) {
        tx = cx + (hand.length * (tileW + tileGap)) / 2 - (i + 1) * (tileW + tileGap)
        ty = pad
      } else {
        tx = pad
        ty = cy - (hand.length * (tileW + tileGap)) / 2 + i * (tileW + tileGap)
      }

      const isVertical = p === 1 || p === 3
      const rw = isVertical ? tileH : tileW
      const rh = isVertical ? tileW : tileH

      if (faceUp) {
        const imgPath = getCardImagePath(card, deckType, { tileSet })
        const inset = 2
        parts.push(`<g data-card="${cardLabel}"><rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><image href="${imgPath}" x="${tx + inset}" y="${ty + inset}" width="${rw - inset * 2}" height="${rh - inset * 2}" preserveAspectRatio="xMidYMid meet"/></g>`)
      } else {
        parts.push(`<g data-card="${cardLabel}"><rect x="${tx}" y="${ty}" width="${rw}" height="${rh}" fill="#f0ede6" rx="4" stroke="#bbb" stroke-width="0.8"/><rect x="${tx + 2}" y="${ty + 2}" width="${rw - 4}" height="${rh - 4}" fill="#c8a96e" rx="2" opacity="0.4"/></g>`)
      }
    }

    const labelPositions = [
      { x: cx, y: totalSize - 4, anchor: 'middle' },
      { x: totalSize - 4, y: cy, anchor: 'middle', rotate: true },
      { x: cx, y: 12, anchor: 'middle' },
      { x: 12, y: cy, anchor: 'middle', rotate: true },
    ]
    const lp = labelPositions[p]
    const rotAttr = lp.rotate ? ` transform="rotate(-90 ${lp.x} ${lp.y})"` : ''
    parts.push(`<text x="${lp.x}" y="${lp.y}" text-anchor="${lp.anchor}" font-size="10" fill="rgba(255,255,255,0.5)" font-family="system-ui"${rotAttr}>${label} (${hand.length})</text>`)
    parts.push('</g>')
  }

  parts.push('</g>')
  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckConfig.label} · ${variantDef.label} · seed: ${seed}</text>`)
  parts.push('</svg>')

  const svg = parts.join('\n')
  if (opts._returnOnly) return svg
  showSvg(svg)
  showInfo({
    deckType,
    seed,
    players: 4,
    label: variantDef.label,
    setupDesc: variantDef.setupDesc,
    variantDesc: variantDef.variantDesc,
    wall: `${wallTiles} tiles (${totalStacks} stacks), break at stack ${breakPoint + 1}`,
    tilesPerHand: dealResult.hands[0]?.length || 0,
  })
  bindDeckHover()
  requestAnimationFrame(fitToView)
}

export function renderTableauSvg(dealResult, opts) {
  const { deckType, deckConfig, variantDef, seed } = opts
  const cardW = 44
  const cardH = 64
  const colGap = 6
  const cascadeStep = 18
  const pad = 20

  const numCols = dealResult.tableau.length
  const maxCascade = Math.max(...dealResult.tableau.map(col => col.length))
  const tableauW = numCols * (cardW + colGap) - colGap
  const tableauH = cardH + (maxCascade - 1) * cascadeStep

  const foundationY = pad
  const tableauY = foundationY + cardH + 20
  const totalW = tableauW + pad * 2
  const totalH = tableauY + tableauH + pad + 20
  const tableauX = pad

  const outerPad = 20
  const w = totalW + outerPad * 2
  const h = totalH + outerPad * 2

  const parts = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`)
  parts.push(`<style>svg text{pointer-events:none;cursor:default}[data-card],[data-zone]{cursor:pointer}</style>`)
  parts.push(`<rect width="${w}" height="${h}" fill="#1b5e3a" rx="16"/>`)
  parts.push(`<rect x="${outerPad}" y="${outerPad}" width="${totalW}" height="${totalH}" fill="#2d7a4f" rx="12" stroke="#1a4a2e" stroke-width="2"/>`)
  parts.push(`<g transform="translate(${outerPad},${outerPad})">`)

  const suitNames = ['Spades', 'Hearts', 'Clubs', 'Diamonds']
  const suitSymbols = ['♠', '♥', '♣', '♦']
  const foundationX = totalW - 4 * (cardW + colGap) - pad + colGap
  for (let f = 0; f < 4; f++) {
    const fx = foundationX + f * (cardW + colGap)
    parts.push(`<g data-zone="Foundation — ${suitNames[f]} (build A→K)">`)
    parts.push(`<rect x="${fx}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="rgba(0,0,0,0.01)" stroke="rgba(255,255,255,0.3)" stroke-width="1.5" rx="3" stroke-dasharray="4 2"/>`)
    parts.push(`<text x="${fx + cardW / 2}" y="${foundationY + cardH / 2 + 5}" text-anchor="middle" font-size="14" fill="rgba(255,255,255,0.2)">${suitSymbols[f]}</text>`)
    parts.push('</g>')
  }

  const drawCount = dealResult.drawPile.length
  const drawX = pad
  const backPath = getCardBackPath(deckType)
  parts.push(`<g data-zone="Stock — ${drawCount} cards (face down)">`)
  if (backPath) {
    parts.push(`<image href="${backPath}" x="${drawX}" y="${foundationY}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/>`)
  } else {
    parts.push(`<rect x="${drawX}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1"/>`)
  }
  parts.push(`<text x="${drawX + cardW / 2}" y="${foundationY + cardH / 2 + 4}" text-anchor="middle" font-size="11" fill="rgba(255,255,255,0.85)" font-weight="bold">${drawCount}</text>`)
  parts.push('</g>')

  const wasteX = drawX + cardW + colGap
  parts.push(`<g data-zone="Waste — draw cards here (empty at start)">`)
  parts.push(`<rect x="${wasteX}" y="${foundationY}" width="${cardW}" height="${cardH}" fill="rgba(0,0,0,0.01)" stroke="rgba(255,255,255,0.2)" stroke-width="1" rx="3" stroke-dasharray="3 2"/>`)
  parts.push(`<text x="${wasteX + cardW / 2}" y="${foundationY + cardH / 2 + 4}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.2)">waste</text>`)
  parts.push('</g>')

  for (let col = 0; col < numCols; col++) {
    const colCards = dealResult.tableau[col]
    const cx = tableauX + col * (cardW + colGap)
    parts.push(`<g data-zone="Column ${col + 1} — ${colCards.length} cards">`)
    for (let row = 0; row < colCards.length; row++) {
      const card = colCards[row]
      const cy = tableauY + row * cascadeStep
      const cardLabel = card.faceUp ? (card.display || card.id) : 'Face down'
      if (card.faceUp) {
        const imgPath = getCardImagePath(card, deckType)
        if (imgPath) {
          parts.push(`<g data-card="${cardLabel}"><image href="${imgPath}" x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`)
        } else {
          parts.push(`<g data-card="${cardLabel}"><rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" fill="#fff" rx="3" stroke="#ccc" stroke-width="0.5"/><text x="${cx + cardW / 2}" y="${cy + cardH / 2 + 4}" text-anchor="middle" font-size="10" fill="#333" font-family="system-ui">${card.display || '?'}</text></g>`)
        }
      } else {
        if (backPath) {
          parts.push(`<g data-card="${cardLabel}"><image href="${backPath}" x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" preserveAspectRatio="xMidYMid meet"/></g>`)
        } else {
          parts.push(`<rect x="${cx}" y="${cy}" width="${cardW}" height="${cardH}" fill="#2a3a6a" rx="3" stroke="#1a2a4a" stroke-width="1" data-card="${cardLabel}"/>`)
        }
      }
    }
    parts.push('</g>')
  }

  parts.push('</g>')
  parts.push(`<text x="${w / 2}" y="${h - 6}" text-anchor="middle" font-size="9" fill="rgba(255,255,255,0.3)" font-family="system-ui">${deckConfig.label} · ${variantDef.label} · seed: ${seed}</text>`)
  parts.push('</svg>')

  const svg = parts.join('\n')
  if (opts._returnOnly) return svg
  showSvg(svg)
  showInfo({
    deckType,
    seed,
    players: 1,
    label: variantDef.label,
    setupDesc: variantDef.setupDesc,
    variantDesc: variantDef.variantDesc,
    tableau: dealResult.tableau.map(col => col.length).join(', '),
    drawPile: dealResult.drawPile.length,
  })
  bindDeckHover()
  requestAnimationFrame(fitToView)
}

async function loadBoardDataAndRender(game, variantDef) {
  const dataFile = game.needsBoardData
  if (!boardDataCache[dataFile]) {
    try {
      const resp = await fetch(`../data/${dataFile}`)
      if (resp.ok) boardDataCache[dataFile] = await resp.json()
    } catch { /* falls through to error display */ }
  }
  const config = { ...variantDef, boardData: boardDataCache[dataFile] || null }
  const svg = renderBoard(config)
  showSvg(svg)
  showInfo(config)
  bindBoardHover(config)
  requestAnimationFrame(fitToView)
}

async function loadStaticSvg(gameId, variantId, variantDef) {
  const path = getStaticSvgPath(gameId, variantId)
  try {
    const resp = await fetch(path)
    if (resp.ok) {
      const svg = await resp.text()
      showSvg(svg)
      showInfo({ ...variantDef, svgPath: path })
    } else {
      showStaticPlaceholder(variantDef, path)
    }
  } catch {
    showStaticPlaceholder(variantDef, path)
  }
  requestAnimationFrame(fitToView)
}

function showStaticPlaceholder(variantDef, path) {
  const container = document.getElementById('board-svg')
  const empty = document.getElementById('board-empty')
  container.innerHTML = `<div class="static-placeholder"><div class="static-icon">&#x1F4CB;</div><p class="static-label">${variantDef.label}</p><p class="static-note">Static SVG — not yet imported</p><p class="static-path">${path}</p></div>`
  container.classList.add('active')
  empty.style.display = 'none'
}

function showNotImplemented(provider) {
  showSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="#1a1a2e" rx="8"/><text x="200" y="80" text-anchor="middle" font-size="14" fill="#e8a030" font-family="system-ui">Final mode — not yet implemented</text><text x="200" y="110" text-anchor="middle" font-size="12" fill="#888" font-family="system-ui">Provider: ${provider}</text><text x="200" y="135" text-anchor="middle" font-size="11" fill="#555" font-family="system-ui">Switch to Original to view</text></svg>`)
  requestAnimationFrame(fitToView)
}

function showSvg(svg) {
  const container = document.getElementById('board-svg')
  const empty = document.getElementById('board-empty')
  container.innerHTML = svg
  container.classList.add('active')
  empty.style.display = 'none'
}

function bindBoardHover(config) {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a cell'

  const position = config.position || config.hexPosition || {}
  const parsedSetup = config.parsedSetup || null
  const PIECE_NAMES = {
    K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn',
    k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn',
    A: 'Archbishop', a: 'Archbishop', C: 'Chancellor', c: 'Chancellor',
    D: 'Dabbaba', d: 'Dabbaba', E: 'Elephant', e: 'Elephant',
    F: 'Ferz', f: 'Ferz', G: 'Gold', g: 'Gold',
    H: 'Horse', h: 'Horse', I: 'Immobiliser', i: 'Immobiliser',
    J: 'Giraffe', j: 'Giraffe', L: 'Lance', l: 'Lance',
    M: 'Amazon', m: 'Amazon', O: 'Ogre', o: 'Ogre',
    S: 'Silver', s: 'Silver', T: 'Tower', t: 'Tower',
    U: 'Unicorn', u: 'Unicorn', V: 'Eagle', v: 'Eagle',
    W: 'War Machine', w: 'War Machine', Y: 'Wyvern', y: 'Wyvern',
    Z: 'Zebra', z: 'Zebra',
    man: 'Man', king: 'King', stone: 'Stone', piece: 'Disc',
  }

  const pieceNameOverrides = config.pieceNames || {}
  const centreMarker = config.centreMarker || null
  const nodeNames = config.nodeNames || null

  const layerLabels = config.layers && config.layers.labels || null

  svgContainer.addEventListener('mouseover', e => {
    const cell = e.target.closest('.board-cell')
    if (!cell) return
    const sq = cell.dataset.sq
    const type = cell.dataset.type || ''
    const layer = cell.dataset.layer
    let text = sq
    if (layer !== undefined && layerLabels) {
      text += ` · ${layerLabels[parseInt(layer)]}`
    }
    const overlayInfo = config._overlaySquares?.[sq]
    if (centreMarker && sq === '0,0') text += ' [Throne]'
    else if (overlayInfo) text += ` [${overlayInfo}]`
    else if (type && type !== 'floor' && !(nodeNames && nodeNames[sq])) text += ` [${type}]`
    if (nodeNames && nodeNames[sq]) text += ` — ${nodeNames[sq]}`
    const layerPositions = config.layerPositions || null
    const piece = (layer !== undefined && layerPositions) ? layerPositions[parseInt(layer)]?.[sq] : position[sq]
    if (piece) {
      const p = typeof piece === 'object' ? piece : { type: String(piece) }
      const fen4Prefix = p.type.length === 2 && FEN4_OWNERS[p.type[0]]
      const name = pieceNameOverrides[p.type] || pieceNameOverrides[p.type.toUpperCase()] || (fen4Prefix ? PIECE_NAMES[p.type[1]] : PIECE_NAMES[p.type]) || p.type
      if (p.color) {
        text += ` — ${p.color} ${name}`
      } else if (fen4Prefix) {
        const ownerName = FEN4_OWNERS[p.type[0]]
        text += ` — ${ownerName.charAt(0).toUpperCase() + ownerName.slice(1)} ${name}`
      } else if (p.type !== p.type.toLowerCase()) {
        const upperOwner = state.game === 'xiangqi' ? 'Red' : 'White'
        text += ` — ${upperOwner} ${name}`
      } else if (p.type !== p.type.toUpperCase()) {
        const lowerOwner = state.game === 'xiangqi' ? 'Black' : 'Black'
        text += ` — ${lowerOwner} ${name}`
      } else {
        text += ` — ${name}`
      }
    }
    if (sq.startsWith('h') && type.startsWith('arm-')) {
      const arm = cell.dataset.arm || type.slice(4)
      const armNames = { N: 'North', NE: 'North-East', SE: 'South-East', S: 'South', SW: 'South-West', NW: 'North-West' }
      const armOrder = ['N', 'NE', 'SE', 'S', 'SW', 'NW']
      const armPlayerColors = ['Red', 'Blue', 'Green', 'Black', 'Purple', 'Brown']
      text = `${sq} — ${armNames[arm] || arm} arm`
      const filledArms = config.filledArms || []
      if (filledArms.includes(arm)) {
        const playerIdx = armOrder.indexOf(arm)
        text += ` — ${armPlayerColors[playerIdx]} player`
      }
    } else if (sq.startsWith('h') && type === 'centre') {
      text = `${sq} — centre (empty)`
    }
    if (parsedSetup && sq.startsWith('pit-')) {
      const idx = parseInt(sq.slice(4), 10)
      const count = parsedSetup.pits ? (parsedSetup.pits[idx] || 0) : 0
      text = `Pit ${idx + 1} — ${count} seed${count !== 1 ? 's' : ''}`
    } else if (parsedSetup && sq.startsWith('store-')) {
      const idx = parseInt(sq.slice(6), 10)
      const count = parsedSetup.stores ? (parsedSetup.stores[idx] || 0) : 0
      text = `Store ${idx + 1} — ${count} seed${count !== 1 ? 's' : ''}`
    } else if (parsedSetup && sq.startsWith('point-')) {
      const idx = parseInt(sq.slice(6), 10) - 1
      const dark = parsedSetup.dark ? (parsedSetup.dark[idx] || 0) : 0
      const light = parsedSetup.light ? (parsedSetup.light[idx] || 0) : 0
      text = `Point ${idx + 1}`
      if (dark > 0) text += ` — ${dark} dark`
      if (light > 0) text += ` — ${light} light`
      if (!dark && !light) text += ' — empty'
    } else if (sq.startsWith('pos-') && config.boardData) {
      const posStr = sq.slice(4)
      const suffix = posStr.match(/[ab]$/)
      const posNum = parseInt(posStr, 10)
      const variant = config.variant || '1904-patent'
      const board = config.boardData.boards[variant]
      if (board) {
        const space = board.spaces.find(s => s.pos === posNum)
        if (space && suffix && suffix[0] === 'b' && space.split) {
          const sp = space.split
          text = `#${space.pos}b ${sp.name} [${sp.type}]`
          if (sp.tax) text += ` — Tax $${sp.tax}`
          if (sp.rent) text += ` — Rent $${sp.rent}`
          if (sp.price) text += ` — Price $${sp.price}`
          if (sp.notes) text += ` — ${sp.notes}`
        } else if (space) {
          const id = suffix ? `${space.pos}${suffix[0]}` : `${space.pos}`
          text = `#${id} ${space.name} [${space.type}]`
          if (space.rent) text += ` — Rent $${space.rent}`
          if (space.price) text += ` — Price $${space.price}`
          if (space.tax) text += ` — Tax $${space.tax}`
          if (space.fare) text += ` — Fare $${space.fare}`
          if (space.fee) text += ` — Fee $${space.fee}`
          if (space.receive) text += ` — Receive $${space.receive}`
          if (space.notes) text += ` — ${space.notes}`
        }
      }
    } else if (sq.startsWith('inner-') && config.boardData) {
      const idx = parseInt(sq.slice(6), 10) - 1
      const variant = config.variant || '1904-patent'
      const board = config.boardData.boards[variant]
      if (board && board.naturalOpportunities && board.naturalOpportunities[idx]) {
        const no = board.naturalOpportunities[idx]
        text = `${no.name} — Wages $${no.wages}, Rent $${no.rent}, Re-entry: ${no.reentryName} (#${no.reentry})`
      } else if (board && board.innerSpaces && board.innerSpaces[idx]) {
        const is = board.innerSpaces[idx]
        text = `Inner: ${is.name} [${is.type}]`
        if (is.fare) text += ` — Fare $${is.fare}`
        if (is.notes) text += ` — ${is.notes}`
      }
    }
    if (text.length > 90) text = text.slice(0, 87) + '...'
    infoBar.textContent = text
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a cell'
  })
}

function bindHexHover(gameConfig) {
  const infoBar = document.getElementById('hex-info-bar')
  const svgContainer = document.getElementById('board-svg')
  infoBar.classList.add('active')
  infoBar.textContent = 'Hover over a hex'

  const descs = gameConfig.getDescriptions ? gameConfig.getDescriptions() : null

  svgContainer.addEventListener('mouseover', e => {
    const poly = e.target.closest('.hex-cell')
    if (!poly) return
    const id = poly.dataset.id || ''
    const type = poly.dataset.type || ''
    const name = poly.dataset.name || ''
    const q = poly.dataset.q
    const r = poly.dataset.r

    let text = id ? `${id} (${q},${r})` : `(${q},${r})`
    if (name) {
      text += ` — ${name}`
    } else if (descs && descs[type]) {
      text += ` — ${descs[type].name}`
      if (descs[type].desc) text += `: ${descs[type].desc}`
    } else if (type) {
      text += ` — ${type}`
    }
    infoBar.textContent = text
  })

  svgContainer.addEventListener('mouseleave', () => {
    infoBar.textContent = 'Hover over a hex'
  })
}

function showInfo(cfg) {
  const info = document.getElementById('derived-info')
  const variants = gamesIndex[state.game]
  const rows = []
  const mode = cfg.static ? 'static' : 'dynamic'
  rows.push(`<div class="info-row"><span class="info-label">Render</span><span class="info-value info-badge info-badge--${mode}">${mode}</span></div>`)
  if (cfg.hexGame) {
    rows.push(`<div class="info-row"><span class="info-label">Generator</span><span class="info-value">${cfg.hexGame}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Hexes</span><span class="info-value">${cfg.hexCount}</span></div>`)
  } else {
    if (cfg.boardStyle) rows.push(`<div class="info-row"><span class="info-label">Board</span><span class="info-value">${cfg.boardStyle}</span></div>`)
    if (cfg.rows) rows.push(`<div class="info-row"><span class="info-label">Size</span><span class="info-value">${cfg.rows}×${cfg.cols}</span></div>`)
    if (cfg.rings) rows.push(`<div class="info-row"><span class="info-label">Rings</span><span class="info-value">${cfg.rings}</span></div>`)
    const displayPieceSet = cfg.pieceSetOverride || cfg.pieceSet4 || (cfg.pieceSet)
    if (displayPieceSet) rows.push(`<div class="info-row"><span class="info-label">Pieces</span><span class="info-value">${displayPieceSet}</span></div>`)
    if (cfg.fen) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.fen}</span></div>`)
    else if (cfg.setup) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.setup}</span></div>`)
    else if (cfg.draughtsSetup) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">${cfg.draughtsSetup.rows} rows each side</span></div>`)
    else if (cfg.fanoronaSetup) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">Standard (22 each)</span></div>`)
    else if (cfg.goHandicap) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">${cfg.goHandicap} handicap stones</span></div>`)
    else if (cfg.asaltoNotation) rows.push(`<div class="info-row info-row--block"><span class="info-label">Setup</span><span class="info-value info-value--fen">${cfg.asaltoNotation}</span></div>`)
    else if (cfg.svgPath) rows.push(`<div class="info-row info-row--block"><span class="info-label">Source</span><span class="info-value info-value--fen">${cfg.svgPath}</span></div>`)
    else if (!cfg.position && !cfg.static) rows.push(`<div class="info-row"><span class="info-label">Setup</span><span class="info-value">Empty board</span></div>`)
    if (cfg.fen || cfg.setup) rows.push(`<div class="info-row"><span class="info-label">Notation</span><span class="info-value">FEN</span></div>`)
    else if (cfg.asaltoNotation) rows.push(`<div class="info-row"><span class="info-label">Notation</span><span class="info-value">Node map</span></div>`)
  }
  if (cfg.deckType) {
    rows.push(`<div class="info-row"><span class="info-label">Deck</span><span class="info-value">${cfg.deckType}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Players</span><span class="info-value">${cfg.players}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Per hand</span><span class="info-value">${cfg.cardsPerHand}</span></div>`)
    if (cfg.community) rows.push(`<div class="info-row"><span class="info-label">Community</span><span class="info-value">${cfg.community}</span></div>`)
    if (cfg.drawPile) rows.push(`<div class="info-row"><span class="info-label">Draw pile</span><span class="info-value">${cfg.drawPile}</span></div>`)
    rows.push(`<div class="info-row"><span class="info-label">Seed</span><span class="info-value">${cfg.seed}</span></div>`)
    if (cfg.deckNotation) rows.push(`<div class="info-row info-row--block"><span class="info-label">State</span><span class="info-value info-value--fen">${cfg.deckNotation}</span></div>`)
  }
  if (cfg.setupDesc) rows.push(`<div class="info-row info-row--block"><span class="info-label">Position</span><span class="info-value">${cfg.setupDesc}</span></div>`)
  if (cfg.variantDesc) rows.push(`<div class="info-row info-row--block"><span class="info-label">Variant</span><span class="info-value">${cfg.variantDesc}</span></div>`)
  info.innerHTML = rows.join('')
}

function fitToView() {
  const svg = document.querySelector('#board-svg svg')
  const container = document.querySelector('.canvas-svg.active')
  if (!svg || !container) return
  const sw = parseFloat(svg.getAttribute('width'))
  const sh = parseFloat(svg.getAttribute('height'))
  const cw = container.clientWidth - 48
  const ch = container.clientHeight - 48
  if (!sw || !sh || !cw || !ch) return
  const scale = Math.min(cw / sw, ch / sh)
  svg.style.transform = `scale(${scale})`
}

if (document.getElementById('game-select')) {
  document.addEventListener('DOMContentLoaded', init)
}

export { buildDraughtsFenFromSetup, parseDraughtsFen, buildGoHandicap, buildFanoronaPosition, fen4ToPosition }
