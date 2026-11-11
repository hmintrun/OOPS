/*
 * Aiko: SVG anime character rig for the business-English app.
 * Drawn entirely in SVG and animated with requestAnimationFrame: breathing,
 * blinking, hair sway, eye tracking, six expressions and lip-sync.
 *
 *   const aiko = AikoCharacter.mount(document.getElementById('stage'));
 *   aiko.setExpression('happy');      // neutral | happy | joy | thinking | surprised | worried
 *   aiko.setMouth(0.6);               // external lip-sync, 0..1 (null releases it)
 *   aiko.talk(true);                  // procedural mouth movement on/off
 *   aiko.speak('[joy] Great job!');   // browser TTS, inline [expression] tags
 *
 * A host app (React Native WebView) can drive it with postMessage, as an
 * object or a JSON string:
 *   { aiko: 'expression', value: 'happy' }   { aiko: 'mouth', value: 0.7 }
 *   { aiko: 'talk', value: true }            { aiko: 'speak', value: '...' }
 *   { aiko: 'stop' }                         { aiko: 'look', x: 0.2, y: -0.1 }
 */
(function (global) {
  'use strict';

  const C = {
    skin: '#fde7dc', skinShade: '#f3c6b4', skinLine: '#d8937f',
    hairShade: '#3f3272', hairLight: '#a193e6', hairLine: '#2c2356',
    irisRing: '#4a250d', irisLow: '#ffd98a', pupil: '#341806',
    lash: '#2a1f40', sclera: '#ffffff', scleraShade: '#cfc3f2',
    blazer: '#30385a', blazerShade: '#20253e', blazerLight: '#414a73',
    shirt: '#ffffff', shirtShade: '#d9d3e8',
    ribbon: '#e9a23b', ribbonShade: '#c27d1e',
    gold: '#f4bd4f', goldShade: '#c98d1f',
    mouth: '#7e2a3f', mouthLine: '#6a2434', tongue: '#f27d8f',
    hatch: '#f0657f', sweat: '#a8daf7', sweatLine: '#5aa6d6',
    bubble: '#ffffff', bubbleLine: '#9686d6', bang: '#e9a23b',
  };

  // Numeric targets per expression; the rig eases toward them every frame.
  const EXPRESSIONS = {
    neutral:   { smile: .35, open: 0,   width: 1,    round: 0,  browL: 0,  browR: 0,  inner: 0,  squint: 0,   eyeScale: 1,    pupil: 1,   joy: 0, blush: .35, hatch: 0,  tilt: 0,  emote: null },
    happy:     { smile: 1,   open: .3,  width: 1.15, round: 0,  browL: -3, browR: -3, inner: 2,  squint: .55, eyeScale: 1,    pupil: 1,   joy: 0, blush: .6,  hatch: .4, tilt: 3,  emote: 'sparkle' },
    joy:       { smile: 1,   open: .55, width: 1.2,  round: 0,  browL: -5, browR: -5, inner: 3,  squint: 0,   eyeScale: 1,    pupil: 1,   joy: 1, blush: .85, hatch: 1,  tilt: 5,  emote: 'sparkle' },
    thinking:  { smile: -.1, open: .06, width: .7,   round: .3, browL: -5, browR: 1,  inner: -3, squint: .15, eyeScale: 1,    pupil: 1,   joy: 0, blush: .3,  hatch: 0,  tilt: -6, emote: 'dots', lookX: -.75, lookY: -.85 },
    surprised: { smile: 0,   open: .6,  width: .75,  round: 1,  browL: -8, browR: -8, inner: 2,  squint: 0,   eyeScale: 1.08, pupil: .72, joy: 0, blush: .3,  hatch: 0,  tilt: 0,  emote: 'bang' },
    worried:   { smile: -.6, open: .1,  width: .9,   round: 0,  browL: -2, browR: -2, inner: 10, squint: .1,  eyeScale: 1,    pupil: .9,  joy: 0, blush: .25, hatch: 0,  tilt: -3, emote: 'sweat', lookX: .2, lookY: .35 },
  };
  const KEYS = ['smile', 'open', 'width', 'round', 'browL', 'browR', 'inner', 'squint', 'eyeScale', 'pupil', 'joy', 'blush', 'hatch', 'tilt'];
  const EMOTES = ['sparkle', 'dots', 'bang', 'sweat'];

  const VISEMES = [
    { o: .95, r: 0, w: 1.1 }, { o: .6, r: 0, w: 1.15 }, { o: .38, r: 0, w: 1.28 },
    { o: .62, r: 1, w: .72 }, { o: .45, r: .6, w: .82 }, { o: .7, r: .2, w: 1 },
  ];
  const CLOSED = { o: .06, r: 0, w: 1 };
  const REST = { o: 0, r: 0, w: 1 };

  const MOUTH_X = 200, MOUTH_Y = 309;

  const FACE = 'M114 170L114 236C114 292 172 334 200 338C228 334 286 292 286 236L286 170C286 108 114 108 114 170Z';
  const BANGS = 'M104 232C94 150 136 84 200 82C264 84 306 150 296 232L284 214C278 196 272 184 264 174C264 192 260 204 252 216C246 198 238 186 228 176C230 194 224 208 214 222C208 202 202 190 192 180C192 196 186 208 176 218C172 200 164 188 152 180C154 194 148 206 138 214C134 200 128 190 120 184C120 202 114 216 104 232Z';
  const BACK_HAIR = 'M200 84C122 84 78 120 78 198C78 262 74 318 64 382L84 372L92 398L108 378L122 396L150 404L250 404L278 396L292 378L308 398L316 372L336 382C326 318 322 262 322 198C322 120 278 84 200 84Z';
  const SCLERA = 'M-25 -4C-20 -18 -6 -22 4 -22C14 -22 22 -17 26 -13L26 6C24 22 10 28 0 28C-12 28 -24 20 -25 6Z';
  const LID_SHADE = 'M-25 -4C-20 -18 -6 -22 4 -22C14 -22 22 -17 26 -13L26 -5C12 -13 -8 -13 -25 5Z';
  const LASH = 'M-30 0C-26 -18 -10 -28 6 -27C16 -26 24 -21 28 -15L25 -12C18 -18 8 -21 -2 -21C-14 -21 -22 -12 -25 -1Z';
  const STAR = 'M0 -10Q1.6 -1.6 10 0Q1.6 1.6 0 10Q-1.6 1.6 -10 0Q-1.6 -1.6 0 -10Z';

  function eye(side, cx) {
    const m = side === 'R' ? ' transform="scale(-1 1)"' : '';
    return `
    <g transform="translate(${cx} 250)">
      <path data-part="crease${side}" d="M-20 -33Q2 -40 22 -29" fill="none" stroke="${C.lash}" stroke-width="1.3" stroke-linecap="round" opacity=".4"${m}/>
      <g data-part="eyeOpen${side}">
        <clipPath id="aiko-eye-${side}"><path d="${SCLERA}"${m}/></clipPath>
        <path d="${SCLERA}" fill="${C.sclera}"${m}/>
        <g clip-path="url(#aiko-eye-${side})">
          <g data-part="iris${side}">
            <ellipse cx="0" cy="4" rx="17" ry="22" fill="url(#aiko-iris)" stroke="${C.irisRing}" stroke-width="1.6"/>
            <ellipse cx="0" cy="16" rx="11" ry="6.5" fill="${C.irisLow}" opacity=".6"/>
            <ellipse data-part="pupil${side}" cx="0" cy="5" rx="7.5" ry="10" fill="${C.pupil}"/>
            <ellipse cx="-6" cy="-5" rx="6" ry="7.5" fill="#fff"/>
            <circle cx="7.5" cy="13" r="2.8" fill="#fff"/>
            <circle cx="-8.5" cy="12" r="1.4" fill="#fff" opacity=".85"/>
          </g>
          <path d="${LID_SHADE}" fill="${C.scleraShade}" opacity=".55"${m}/>
        </g>
        <g${m}>
          <path d="${LASH}" fill="${C.lash}"/>
          <path d="M-26 -6L-36 -10L-27 1Z" fill="${C.lash}"/>
          <path d="M-16 25Q0 31 16 24" fill="none" stroke="#6b4561" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
        </g>
      </g>
      <g data-part="lid${side}" opacity="0"${m}>
        <path d="M-27 8Q0 20 27 6" fill="none" stroke="${C.lash}" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M-26 8L-34 4" fill="none" stroke="${C.lash}" stroke-width="2.6" stroke-linecap="round"/>
      </g>
      <g data-part="joy${side}" opacity="0"${m}>
        <path d="M-22 12Q0 -12 22 12" fill="none" stroke="${C.lash}" stroke-width="3.8" stroke-linecap="round"/>
      </g>
    </g>`;
  }

  function buildSVG() {
    return `
<svg viewBox="0 0 400 480" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet" role="img" aria-label="Aiko, an anime business-English coach">
  <defs>
    <linearGradient id="aiko-iris" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4f240b"/><stop offset=".42" stop-color="#b8661f"/>
      <stop offset=".8" stop-color="#f0a83c"/><stop offset="1" stop-color="#ffd98a"/>
    </linearGradient>
    <linearGradient id="aiko-hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7262b4"/><stop offset="1" stop-color="#4d3f86"/>
    </linearGradient>
    <linearGradient id="aiko-hairback" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4b3d82"/><stop offset="1" stop-color="#362a66"/>
    </linearGradient>
    <linearGradient id="aiko-blazer" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#394265"/><stop offset="1" stop-color="#262c48"/>
    </linearGradient>
    <radialGradient id="aiko-blush">
      <stop offset="0" stop-color="#ff8ea4" stop-opacity=".95"/>
      <stop offset=".6" stop-color="#ff8ea4" stop-opacity=".45"/>
      <stop offset="1" stop-color="#ff8ea4" stop-opacity="0"/>
    </radialGradient>
    <path id="aiko-bangs" d="${BANGS}"/>
    <clipPath id="aiko-face"><path d="${FACE}"/></clipPath>
    <clipPath id="aiko-mouth"><path data-part="mouthClip" d=""/></clipPath>
  </defs>

  <g data-part="headBack"><g data-part="hairBack">
    <path d="${BACK_HAIR}" fill="url(#aiko-hairback)"/>
    <path d="M140 300C150 340 150 380 150 404L250 404C250 380 250 340 260 300Z" fill="${C.hairShade}" opacity=".6"/>
  </g></g>

  <g data-part="body">
    <path d="M180 296L179 378L221 378L220 296Z" fill="${C.skin}"/>
    <path d="M179 318Q200 352 221 318L221 344Q200 356 179 344Z" fill="${C.skinShade}"/>
    <path d="M174 370Q200 386 226 370L246 402L200 480L154 402Z" fill="${C.shirt}"/>
    <path d="M46 480C50 428 92 398 148 386L180 376L170 398L194 480Z" fill="url(#aiko-blazer)"/>
    <path d="M354 480C350 428 308 398 252 386L220 376L230 398L206 480Z" fill="url(#aiko-blazer)"/>
    <g fill="none" stroke="${C.blazerShade}" stroke-width="2.2" stroke-linecap="round">
      <path d="M98 404C106 430 110 456 110 480"/>
      <path d="M302 404C294 430 290 456 290 480"/>
    </g>
    <g fill="${C.blazerLight}" stroke="${C.blazerShade}" stroke-width="1.4" stroke-linejoin="round">
      <path d="M180 376L152 392L170 410L160 418L193 474L170 398Z"/>
      <path d="M220 376L248 392L230 410L240 418L207 474L230 398Z"/>
    </g>
    <g fill="${C.shirt}" stroke="${C.shirtShade}" stroke-width="1.4" stroke-linejoin="round">
      <path d="M181 366L166 396L197 408L192 378Z"/>
      <path d="M219 366L234 396L203 408L208 378Z"/>
    </g>
    <g fill="${C.ribbon}" stroke="${C.ribbonShade}" stroke-width="1.2" stroke-linejoin="round">
      <path d="M197 402L186 430L193 427L197 434L200 404Z"/>
      <path d="M203 402L214 430L207 427L203 434L200 404Z"/>
      <path d="M200 398C190 387 177 385 175 392C173 401 178 409 187 408C193 406 197 402 200 400Z"/>
      <path d="M200 398C210 387 223 385 225 392C227 401 222 409 213 408C207 406 203 402 200 400Z"/>
    </g>
    <ellipse cx="200" cy="399" rx="5.2" ry="5" fill="${C.ribbonShade}"/>
    <g transform="rotate(-4 263 438)">
      <rect x="238" y="424" width="50" height="29" rx="4" fill="#fff" stroke="#d6cfe6" stroke-width="1.2"/>
      <path d="M238 428a4 4 0 0 1 4 -4h42a4 4 0 0 1 4 4v3h-50z" fill="${C.ribbon}"/>
      <text x="263" y="445" text-anchor="middle" font-family="'M PLUS Rounded 1c', 'Be Vietnam Pro', system-ui, sans-serif" font-weight="800" font-size="10" letter-spacing="1" fill="${C.blazer}">AIKO</text>
      <text x="263" y="450.5" text-anchor="middle" font-family="'Be Vietnam Pro', system-ui, sans-serif" font-size="4.4" letter-spacing=".4" fill="#7a7290">BUSINESS ENGLISH</text>
    </g>
  </g>

  <g data-part="head">
    <path d="${FACE}" fill="${C.skin}"/>
    <g clip-path="url(#aiko-face)"><use href="#aiko-bangs" transform="translate(0 8)" fill="${C.skinShade}"/></g>
    <g data-part="blush">
      <ellipse cx="144" cy="288" rx="17" ry="9" fill="url(#aiko-blush)"/>
      <ellipse cx="256" cy="288" rx="17" ry="9" fill="url(#aiko-blush)"/>
    </g>
    <g data-part="hatch" opacity="0" fill="none" stroke="${C.hatch}" stroke-width="1.6" stroke-linecap="round">
      <path d="M135 293L140 284M143 293L148 284M151 293L156 284"/>
      <path d="M245 293L250 284M253 293L258 284M261 293L266 284"/>
    </g>
    ${eye('L', 158)}
    ${eye('R', 242)}
    <path d="M202 285Q198.5 291 201 294" fill="none" stroke="${C.skinLine}" stroke-width="1.6" stroke-linecap="round"/>
    <g>
      <path data-part="mouth" fill="${C.mouth}"/>
      <g clip-path="url(#aiko-mouth)">
        <rect data-part="teeth" fill="#fff" opacity="0"/>
        <ellipse data-part="tongue" fill="${C.tongue}"/>
      </g>
      <path data-part="mouthLine" fill="none" stroke="${C.mouthLine}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>
    </g>

    <g data-part="lockL">
      <path d="M110 176C98 230 92 300 96 376L104 362L110 398C118 330 122 262 128 208C126 196 122 186 116 178Z" fill="url(#aiko-hair)"/>
      <path d="M112 204C105 254 103 306 105 360" fill="none" stroke="${C.hairShade}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    </g>
    <g data-part="lockR">
      <path d="M290 176C302 230 308 300 304 376L296 362L290 398C282 330 278 262 272 208C274 196 278 186 284 178Z" fill="url(#aiko-hair)"/>
      <path d="M288 204C295 254 297 306 295 360" fill="none" stroke="${C.hairShade}" stroke-width="2" stroke-linecap="round" opacity=".55"/>
    </g>
    <g data-part="ahoge">
      <path d="M206 86C208 64 226 48 244 52C248 53 250 56 248 58C232 58 218 70 214 88Z" fill="url(#aiko-hair)"/>
    </g>
    <use href="#aiko-bangs" fill="url(#aiko-hair)"/>
    <g fill="none" stroke="${C.hairLine}" stroke-width="1.4" stroke-linecap="round" opacity=".4">
      <path d="M200 92C198 128 195 158 192 180"/>
      <path d="M170 98C160 128 155 156 152 180"/>
      <path d="M230 98C234 128 232 154 228 176"/>
      <path d="M142 116C130 140 124 164 120 184"/>
      <path d="M260 112C266 138 267 158 264 174"/>
    </g>
    <path d="M136 134C168 112 232 112 264 134" fill="none" stroke="${C.hairLight}" stroke-width="6" stroke-linecap="round" stroke-dasharray="20 9" opacity=".7"/>
    <g fill="none" stroke="${C.hairLight}" stroke-width="2.4" stroke-linecap="round" opacity=".45">
      <path d="M163 150Q160 164 156 175"/>
      <path d="M236 150Q238 162 240 172"/>
    </g>
    <g fill="${C.gold}" stroke="${C.goldShade}" stroke-width="1" stroke-linejoin="round">
      <path d="${STAR}" transform="translate(268 144) scale(.95)"/>
      <path d="${STAR}" transform="translate(282 160) scale(.5)"/>
    </g>
    <path data-part="browL" d="M138 210Q154 199 174 204" fill="none" stroke="${C.hairLine}" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>
    <path data-part="browR" d="M226 204Q246 199 262 210" fill="none" stroke="${C.hairLine}" stroke-width="3.2" stroke-linecap="round" opacity=".9"/>

    <g data-part="emSparkle" opacity="0" fill="${C.gold}" stroke="${C.goldShade}" stroke-width="1" stroke-linejoin="round">
      <path data-star="" data-x="322" data-y="112" data-s="1.1" d="${STAR}"/>
      <path data-star="" data-x="298" data-y="80" data-s=".7" d="${STAR}"/>
      <path data-star="" data-x="340" data-y="152" data-s=".55" d="${STAR}"/>
    </g>
    <g data-part="emDots" opacity="0" fill="${C.bubble}" stroke="${C.bubbleLine}" stroke-width="1.5">
      <circle data-dot="" cx="300" cy="132" r="3.2"/>
      <circle data-dot="" cx="313" cy="116" r="4.6"/>
      <circle data-dot="" cx="331" cy="96" r="6.4"/>
    </g>
    <g data-part="emBang" opacity="0" fill="none" stroke="${C.bang}" stroke-width="3.6" stroke-linecap="round">
      <path d="M298 120L287 103M308 115L306 94M317 122L330 109"/>
    </g>
    <g data-part="emSweat" opacity="0">
      <path d="M292 152C296 159 300 164 300 168A8 8 0 0 1 284 168C284 164 288 159 292 152Z" fill="${C.sweat}" stroke="${C.sweatLine}" stroke-width="1.2"/>
      <ellipse cx="289" cy="167" rx="1.6" ry="2.6" fill="#fff" opacity=".9"/>
    </g>
  </g>
</svg>`;
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const f = (n) => String(Math.round(n * 100) / 100);

  function mouthGeom(open, smile, width, round) {
    const w = 10.5 * width * (1 - 0.32 * round);
    const corner = -smile * 3 + round * open * 1.5;
    const up = smile * 1.1 - open * (1.6 + round * 2.2);
    const low = smile * 2.6 + open * 15 * (1 - round * 0.25);
    const k = 0.5 + 0.4 * round;
    const kl = 0.7 + 0.25 * round;
    const x = MOUTH_X, y = MOUTH_Y;
    const d = `M${f(x - w)} ${f(y + corner)}C${f(x - w * k)} ${f(y + up)} ${f(x + w * k)} ${f(y + up)} ${f(x + w)} ${f(y + corner)}` +
      `C${f(x + w * kl)} ${f(y + low)} ${f(x - w * kl)} ${f(y + low)} ${f(x - w)} ${f(y + corner)}Z`;
    return { d, w, corner, up, low };
  }

  function parseScript(text) {
    const parts = [];
    const re = /\[([a-z]+)\]/gi;
    let last = 0, expr = null, m;
    while ((m = re.exec(text))) {
      const chunk = text.slice(last, m.index).trim();
      if (chunk) parts.push({ expr, text: chunk });
      const name = m[1].toLowerCase();
      expr = EXPRESSIONS[name] ? name : expr;
      last = re.lastIndex;
    }
    const tail = text.slice(last).trim();
    if (tail) parts.push({ expr, text: tail });
    return parts;
  }

  const estimate = (text) => 300 + text.split(/\s+/).filter(Boolean).length * 340;

  function pickVoice() {
    const synth = global.speechSynthesis;
    if (!synth) return null;
    const voices = synth.getVoices().filter((v) => /^en([-_]|$)/i.test(v.lang));
    const preferred = [/samantha/i, /aria/i, /jenny/i, /google us english/i, /zira/i, /female/i, /karen/i, /tessa/i, /moira/i];
    for (const re of preferred) {
      const v = voices.find((x) => re.test(x.name));
      if (v) return v;
    }
    return voices.find((v) => /en[-_]us/i.test(v.lang)) || voices[0] || null;
  }

  function mount(container, options) {
    const opts = Object.assign({ followPointer: true, listenMessages: true }, options || {});
    container.innerHTML = buildSVG();
    const svg = container.querySelector('svg');
    const part = (n) => svg.querySelector('[data-part="' + n + '"]');
    const P = {};
    ['head', 'headBack', 'hairBack', 'body', 'blush', 'hatch', 'mouth', 'mouthLine', 'mouthClip', 'teeth', 'tongue',
      'lockL', 'lockR', 'ahoge', 'browL', 'browR', 'emSparkle', 'emDots', 'emBang', 'emSweat'].forEach((n) => { P[n] = part(n); });
    const eyes = ['L', 'R'].map((s) => ({
      open: part('eyeOpen' + s), iris: part('iris' + s), pupil: part('pupil' + s),
      lid: part('lid' + s), joy: part('joy' + s), crease: part('crease' + s),
    }));
    const stars = Array.from(svg.querySelectorAll('[data-star]')).map((el) => ({
      el, x: +el.dataset.x, y: +el.dataset.y, s: +el.dataset.s,
    }));
    const dots = Array.from(svg.querySelectorAll('[data-dot]'));

    const listeners = {};
    const emit = (type, value) => (listeners[type] || []).forEach((fn) => {
      try { fn(value); } catch (err) { console.error(err); }
    });

    let expr = 'neutral';
    const cur = {};
    KEYS.forEach((k) => { cur[k] = EXPRESSIONS.neutral[k]; });
    const em = { sparkle: 0, dots: 0, bang: 0, sweat: 0 };

    let clock = 0, lastNow = performance.now(), raf = 0;
    let blink = 0, blinkAt = -1, nextBlink = 1.4;
    const look = { x: 0, y: 0 }, sacc = { x: 0, y: 0 };
    let nextSaccade = 0.8, pointer = null, follow = !!opts.followPointer;
    let talking = false, talkLevel = 0, nextVis = 0, visTarget = REST;
    const vis = { o: 0, r: 0, w: 1 };
    let mouthOverride = null, mo = 0;
    const ah = { a: 0, v: 0 };
    let session = null, neutralTimer = 0, pokeTimers = [];

    const motionQuery = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : null;
    let R = motionQuery && motionQuery.matches ? 0.3 : 1;
    const onMotionChange = (e) => { R = e.matches ? 0.3 : 1; };
    if (motionQuery && motionQuery.addEventListener) motionQuery.addEventListener('change', onMotionChange);

    function setExpr(name) {
      if (!EXPRESSIONS[name]) return false;
      if (name !== expr) {
        expr = name;
        ah.v += 160;
        emit('expression', name);
      }
      return true;
    }

    function updateBlink() {
      if (blinkAt < 0) {
        if (clock < nextBlink) { blink = 0; return; }
        blinkAt = clock;
      }
      const p = clock - blinkAt;
      if (p < 0.07) blink = p / 0.07;
      else if (p < 0.18) blink = 1 - (p - 0.07) / 0.11;
      else {
        blink = 0;
        blinkAt = -1;
        nextBlink = clock + (Math.random() < 0.18 ? 0.15 : 2 + Math.random() * 3.6);
      }
    }

    function updateLook(dt, tgt) {
      let tx, ty;
      if (tgt.lookX != null) { tx = tgt.lookX; ty = tgt.lookY; }
      else if (pointer && clock - pointer.t < 2.5) { tx = pointer.x; ty = pointer.y; }
      else {
        if (clock >= nextSaccade) {
          const center = Math.random() < 0.45;
          sacc.x = center ? 0 : (Math.random() * 2 - 1) * 0.4;
          sacc.y = center ? 0 : (Math.random() * 2 - 1) * 0.25;
          nextSaccade = clock + 1.2 + Math.random() * 2.8;
        }
        tx = sacc.x; ty = sacc.y;
      }
      const a = 1 - Math.exp(-dt * 14);
      look.x += (tx - look.x) * a;
      look.y += (ty - look.y) * a;
    }

    function updateTalk(dt) {
      if (talking) {
        if (clock >= nextVis) {
          let v;
          do { v = Math.random() < 0.14 ? CLOSED : VISEMES[(Math.random() * VISEMES.length) | 0]; } while (v === visTarget);
          visTarget = v;
          nextVis = clock + 0.065 + Math.random() * 0.09;
        }
      } else {
        visTarget = REST;
      }
      talkLevel += ((talking ? 1 : 0) - talkLevel) * (1 - Math.exp(-dt * 12));
      const a = 1 - Math.exp(-dt * 26);
      vis.o += (visTarget.o - vis.o) * a;
      vis.r += (visTarget.r - vis.r) * a;
      vis.w += (visTarget.w - vis.w) * a;
      const target = mouthOverride == null ? 0 : mouthOverride;
      mo += (target - mo) * (1 - Math.exp(-dt * 30));
    }

    function updateAhoge(dt) {
      const target = Math.sin(clock * 2.4) * 4 * R;
      ah.v += (-(ah.a - target) * 80 - ah.v * 6) * dt;
      ah.a += ah.v * dt;
    }

    function render() {
      const t = clock;
      const breathe = Math.sin(t * 2 * Math.PI / 3.8);
      const sway = (Math.sin(t * 2 * Math.PI / 7.3) * 1.3 + Math.sin(t * 2 * Math.PI / 3.1) * 0.4) * R;
      const nod = talkLevel * Math.sin(t * 6.2) * 0.9 * R;
      const tilt = cur.tilt + sway + nod + look.x * 2;
      const bob = breathe * 2.2 * R - talkLevel * Math.abs(Math.sin(t * 5.1)) * 1.2 * R;
      const headT = `translate(${f(look.x * 3)} ${f(bob)}) rotate(${f(tilt)} 200 350)`;
      P.head.setAttribute('transform', headT);
      P.headBack.setAttribute('transform', headT);
      P.hairBack.setAttribute('transform', `rotate(${f(-sway * 0.4 + Math.sin(t * 1.25) * 0.5 * R)} 200 120)`);
      P.body.setAttribute('transform', `translate(0 ${f(breathe * 1.3 * R)})`);

      const lag = (tilt - cur.tilt) * 0.5;
      const flutter = talkLevel * 0.6;
      P.lockL.setAttribute('transform', `rotate(${f(Math.sin(t * 1.6) * 1.8 * R - lag + Math.sin(t * 6.5) * flutter)} 116 184)`);
      P.lockR.setAttribute('transform', `rotate(${f(Math.sin(t * 1.6 + 0.9) * 1.8 * R - lag + Math.sin(t * 6.5 + 1) * flutter)} 284 184)`);
      P.ahoge.setAttribute('transform', `rotate(${f(ah.a)} 208 88)`);

      const k = cur.eyeScale;
      const bs = 1 - blink * 0.92;
      const ss = 1 - cur.squint * 0.22;
      const eyeT = `translate(0 16) scale(${f(k)} ${f(k * bs)}) translate(0 -16) translate(0 -20) scale(1 ${f(ss)}) translate(0 20)`;
      const openOp = f(1 - cur.joy);
      const lidOp = f((blink > 0.55 ? (blink - 0.55) / 0.45 : 0) * (1 - cur.joy));
      const joyOp = f(cur.joy);
      const irisT = `translate(${f(look.x * 5)} ${f(look.y * 4)})`;
      const pupilT = `translate(0 5) scale(${f(cur.pupil)}) translate(0 -5)`;
      const creaseOp = f(0.4 * (1 - cur.joy) * (1 - blink * 0.7));
      for (const e of eyes) {
        e.open.setAttribute('transform', eyeT);
        e.open.setAttribute('opacity', openOp);
        e.lid.setAttribute('opacity', lidOp);
        e.joy.setAttribute('opacity', joyOp);
        e.iris.setAttribute('transform', irisT);
        e.pupil.setAttribute('transform', pupilT);
        e.crease.setAttribute('opacity', creaseOp);
      }

      const by = look.y * 1.5;
      P.browL.setAttribute('transform', `translate(0 ${f(cur.browL + by)}) rotate(${f(-cur.inner)} 156 205)`);
      P.browR.setAttribute('transform', `translate(0 ${f(cur.browR + by)}) rotate(${f(cur.inner)} 244 205)`);
      P.blush.setAttribute('opacity', f(cur.blush));
      P.hatch.setAttribute('opacity', f(cur.hatch));

      let open = cur.open, round = cur.round, width = cur.width, smile = cur.smile;
      if (talkLevel > 0.001) {
        open = lerp(open, Math.max(vis.o, open * 0.35), talkLevel);
        round = lerp(round, Math.max(vis.r, round * 0.5), talkLevel);
        width = lerp(width, width * vis.w, talkLevel);
        smile = lerp(smile, smile * 0.7 + 0.12, talkLevel);
      }
      if (mo > 0.001) {
        open = Math.max(open * (1 - mo), mo);
        width *= 1 + 0.08 * mo;
      }
      const g = mouthGeom(open, smile, width, round);
      P.mouth.setAttribute('d', g.d);
      P.mouthLine.setAttribute('d', g.d);
      P.mouthClip.setAttribute('d', g.d);
      P.teeth.setAttribute('x', f(MOUTH_X - g.w));
      P.teeth.setAttribute('y', f(MOUTH_Y + Math.min(g.up, g.corner) - 2));
      P.teeth.setAttribute('width', f(g.w * 2));
      P.teeth.setAttribute('height', '5.4');
      P.teeth.setAttribute('opacity', f(clamp((open - 0.25) * 3, 0, 1)));
      P.tongue.setAttribute('cx', String(MOUTH_X));
      P.tongue.setAttribute('cy', f(MOUTH_Y + g.low * 0.62 + 1));
      P.tongue.setAttribute('rx', f(g.w * 0.62));
      P.tongue.setAttribute('ry', f(Math.max(0.01, open * 6.5)));

      P.emSparkle.setAttribute('opacity', f(em.sparkle));
      if (em.sparkle > 0.01) {
        stars.forEach((s, i) => {
          const tw = 0.82 + 0.22 * Math.sin(t * 4.2 + i * 1.7);
          s.el.setAttribute('transform', `translate(${s.x} ${s.y}) rotate(${f(Math.sin(t * 2 + i) * 12)}) scale(${f(s.s * tw * (0.6 + 0.4 * em.sparkle))})`);
        });
      }
      P.emDots.setAttribute('opacity', f(em.dots));
      if (em.dots > 0.01) {
        dots.forEach((d, i) => d.setAttribute('opacity', f(0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 4 - i * 0.9)))));
      }
      P.emBang.setAttribute('opacity', f(em.bang));
      P.emBang.setAttribute('transform', `translate(305 112) scale(${f(0.6 + 0.4 * em.bang)}) translate(-305 -112)`);
      P.emSweat.setAttribute('opacity', f(em.sweat));
      P.emSweat.setAttribute('transform', `translate(0 ${f(Math.sin(t * 2.2) * 1.6)})`);
    }

    function frame(now) {
      const dt = Math.min(0.05, Math.max(0, (now - lastNow) / 1000));
      lastNow = now;
      clock += dt;
      const tgt = EXPRESSIONS[expr];
      const a = 1 - Math.exp(-dt * 10);
      for (const key of KEYS) cur[key] += (tgt[key] - cur[key]) * a;
      const ae = 1 - Math.exp(-dt * 8);
      for (const e of EMOTES) em[e] += ((tgt.emote === e ? 1 : 0) - em[e]) * ae;
      updateBlink();
      updateLook(dt, tgt);
      updateTalk(dt);
      updateAhoge(dt);
      render();
      raf = global.requestAnimationFrame(frame);
    }

    function kick() {
      if (!talking) return;
      visTarget = CLOSED;
      nextVis = clock + 0.04;
    }

    function clearSession() {
      if (!session) return;
      session.timers.forEach(clearTimeout);
      const done = session.resolve;
      session = null;
      done();
    }

    function stop() {
      const synth = global.speechSynthesis;
      clearSession();
      if (synth && (synth.speaking || synth.pending)) synth.cancel();
      talking = false;
      emit('caption', '');
    }

    function speak(text) {
      stop();
      clearTimeout(neutralTimer);
      const parts = parseScript(String(text || ''));
      if (!parts.length) return Promise.resolve();
      const synth = global.speechSynthesis;
      const useTTS = !!(synth && global.SpeechSynthesisUtterance);

      return new Promise((resolve) => {
        const s = { timers: [], resolve, simulated: false, started: false };
        session = s;
        const live = () => session === s;

        const enter = (i) => {
          if (parts[i].expr) setExpr(parts[i].expr);
          emit('caption', parts[i].text);
          talking = true;
        };
        const finish = () => {
          if (!live()) return;
          talking = false;
          emit('caption', '');
          clearSession();
          neutralTimer = setTimeout(() => { if (!session) setExpr('neutral'); }, 1800);
        };
        const simulate = () => {
          if (!live() || s.simulated) return;
          s.simulated = true;
          if (useTTS && (synth.speaking || synth.pending)) synth.cancel();
          let i = 0;
          const next = () => {
            if (!live()) return;
            if (i >= parts.length) { finish(); return; }
            enter(i);
            s.timers.push(setTimeout(() => {
              talking = false;
              i += 1;
              s.timers.push(setTimeout(next, 180));
            }, estimate(parts[i].text)));
          };
          next();
        };

        if (!useTTS) { simulate(); return; }

        const voice = pickVoice();
        parts.forEach((p, i) => {
          const u = new global.SpeechSynthesisUtterance(p.text);
          u.lang = 'en-US';
          if (voice) u.voice = voice;
          u.pitch = 1.35;
          u.rate = 1;
          u.onstart = () => { if (!live() || s.simulated) return; s.started = true; enter(i); };
          u.onboundary = () => { if (live()) kick(); };
          u.onend = () => {
            if (!live() || s.simulated) return;
            talking = false;
            if (i === parts.length - 1) finish();
          };
          u.onerror = () => {
            if (!live() || s.simulated) return;
            if (!s.started) simulate();
            else if (i === parts.length - 1) finish();
          };
          synth.speak(u);
        });
        // Some embedded browsers accept speak() but never play audio; fall back to a silent mouth animation.
        s.timers.push(setTimeout(() => { if (!s.started) simulate(); }, 1600));
        const total = parts.reduce((sum, p) => sum + estimate(p.text), 0);
        s.timers.push(setTimeout(() => { if (!s.simulated) finish(); }, total * 3 + 5000));
      });
    }

    function poke() {
      if (session) return;
      pokeTimers.forEach(clearTimeout);
      clearTimeout(neutralTimer);
      const before = expr === 'surprised' || expr === 'joy' ? 'neutral' : expr;
      ah.v += 260;
      setExpr('surprised');
      pokeTimers = [
        setTimeout(() => setExpr('joy'), 650),
        setTimeout(() => setExpr(before), 2100),
      ];
      emit('poke');
    }

    function onPointer(e) {
      if (!follow) return;
      const m = svg.getScreenCTM();
      if (!m) return;
      const hx = m.a * 200 + m.c * 250 + m.e;
      const hy = m.b * 200 + m.d * 250 + m.f;
      const scale = Math.max(80, m.a * 260);
      pointer = { x: clamp((e.clientX - hx) / scale, -1, 1), y: clamp((e.clientY - hy) / scale, -1, 1), t: clock };
    }

    function onMessage(e) {
      let msg = e.data;
      if (typeof msg === 'string') {
        try { msg = JSON.parse(msg); } catch (err) { return; }
      }
      if (!msg || typeof msg !== 'object' || typeof msg.aiko !== 'string') return;
      switch (msg.aiko) {
        case 'expression': api.setExpression(msg.value); break;
        case 'mouth': api.setMouth(msg.value); break;
        case 'talk': api.talk(msg.value); break;
        case 'speak': api.speak(msg.value); break;
        case 'stop': api.stop(); break;
        case 'look': api.lookAt(msg.x, msg.y); break;
        default: break;
      }
    }

    const onClick = () => poke();
    svg.addEventListener('click', onClick);
    global.addEventListener('pointermove', onPointer, { passive: true });
    if (opts.listenMessages) {
      global.addEventListener('message', onMessage);
      document.addEventListener('message', onMessage); // React Native WebView on Android
    }
    const synth = global.speechSynthesis;
    const warmVoices = () => { try { synth.getVoices(); } catch (err) { /* ignore */ } };
    if (synth) {
      warmVoices();
      if (synth.addEventListener) synth.addEventListener('voiceschanged', warmVoices);
    }

    const api = {
      expressions: Object.keys(EXPRESSIONS),
      get expression() { return expr; },
      setExpression(name) {
        clearTimeout(neutralTimer);
        pokeTimers.forEach(clearTimeout);
        return setExpr(String(name || '').toLowerCase());
      },
      setMouth(v) { mouthOverride = v == null || v === '' ? null : clamp(Number(v) || 0, 0, 1); },
      talk(on) { talking = !!on; },
      lookAt(x, y) { pointer = x == null ? null : { x: clamp(+x, -1, 1), y: clamp(+y || 0, -1, 1), t: clock + 1e6 }; },
      setFollowPointer(on) { follow = !!on; if (!follow) pointer = null; },
      speak,
      stop,
      poke,
      on(type, fn) {
        (listeners[type] = listeners[type] || []).push(fn);
        return () => { listeners[type] = (listeners[type] || []).filter((x) => x !== fn); };
      },
      destroy() {
        stop();
        global.cancelAnimationFrame(raf);
        svg.removeEventListener('click', onClick);
        global.removeEventListener('pointermove', onPointer);
        global.removeEventListener('message', onMessage);
        document.removeEventListener('message', onMessage);
        if (motionQuery && motionQuery.removeEventListener) motionQuery.removeEventListener('change', onMotionChange);
        if (synth && synth.removeEventListener) synth.removeEventListener('voiceschanged', warmVoices);
        container.innerHTML = '';
      },
    };

    render();
    raf = global.requestAnimationFrame(frame);
    return api;
  }

  global.AikoCharacter = { mount, expressions: Object.keys(EXPRESSIONS), parseScript };
})(typeof window !== 'undefined' ? window : this);
