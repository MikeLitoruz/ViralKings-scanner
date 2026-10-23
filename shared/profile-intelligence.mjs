/*
 * Viral Scanner V6 profile intelligence
 *
 * One semantic profile describes WHAT the user wants to see. Platform adapters
 * decide HOW to discover that semantic intent on their own platform. Language
 * is metadata on a concept term, never a separate semantic bucket.
 */

export const PROFILE_SCHEMA_VERSION = 6;
export const TARGET_MARKETS = Object.freeze([
  {language:'en',region:'US',label:'English'},
  {language:'es',region:'ES',label:'Español'}, {language:'pt',region:'BR',label:'Português'},
  {language:'fr',region:'FR',label:'Français'}, {language:'de',region:'DE',label:'Deutsch'},
  {language:'nl',region:'NL',label:'Nederlands'}, {language:'pl',region:'PL',label:'Polski'},
  {language:'ru',region:'RU',label:'Русский'}, {language:'tr',region:'TR',label:'Türkçe'},
  {language:'ar',region:'SA',label:'العربية'}, {language:'id',region:'ID',label:'Bahasa Indonesia'},
  {language:'hi',region:'IN',label:'हिन्दी'}, {language:'bn',region:'BD',label:'বাংলা'},
  {language:'ta',region:'IN',label:'தமிழ்'}, {language:'zh',region:'TW',label:'中文'},
  {language:'ja',region:'JP',label:'日本語'}, {language:'ko',region:'KR',label:'한국어'},
]);

export const HARD_NOISE_PHRASES = Object.freeze([
  'sound effect','sound effects','sfx','green screen','greenscreen','meme','meme template','gameplay','walkthrough',
  'vfx','cgi','animation','animated','cartoon','simulation','simulator','movie scene','film scene','trailer',
  'minecraft','fortnite','roblox','beamng','gaming','gta5','gta 5','gta v','grand theft auto','video game','after effects','premiere pro','tutorial','how to make',
  'music video','official audio','lyrics','lyric video','karaoke','instrumental','full album','album','song','podcast',
  'reaction video','reacts to','compilation','top 10','top ten','fails compilation','crash test','crash tests','crash testing',
  'mega win','sensational win','ultimate win','jackpot win','slot game','slot machine game','casino gameplay','casino bonus',
]);

export const DISCOVERY_PHRASES = Object.freeze([
  'caught on camera','footage','caught on dashcam','dashcam footage','caught on cctv','cctv footage','raw footage'
]);
export const WIKIDATA_DESCRIPTION_NOISE = Object.freeze([
  'album','song','single','film','movie','television','tv series','episode','novel','book','video game','game','software','band','musician','rapper','singer',
  'actor','actress','person','company','organization','organisation','record label','fictional','character','manga','anime','podcast'
]);

const MARKET = Object.fromEntries(TARGET_MARKETS.map(x=>[x.language,x.region]));
const term=(text,language='en',region=MARKET[language]||'GLOBAL')=>({text,language,region});
const concept=(id,label,relation,tier,acceptance,terms,extra={})=>({id,label,relation,tier,acceptance,terms,...extra});
const clone=(x)=>JSON.parse(JSON.stringify(x));
export function normalize(value){return String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase();}
export function unique(values){const out=[],seen=new Set();for(const x of values||[]){const k=normalize(typeof x==='object'?JSON.stringify(x):x);if(!k||seen.has(k))continue;seen.add(k);out.push(x);}return out;}
export const PROFILE_NAME_ALIASES = Object.freeze({'Police Chases':'Police Chase'});
export function canonicalProfileName(name){const raw=String(name??'').trim();return PROFILE_NAME_ALIASES[raw]??raw;}
export function profileIdentity(rowOrProfile={}){return String(rowOrProfile?.ProfileId??rowOrProfile?.id??canonicalProfileName(rowOrProfile?.Profile??rowOrProfile?.name??'')).trim();}
export function phraseInText(text,phrase){const h=normalize(text),n=normalize(phrase);if(!h||!n)return false;if(/^[\p{L}\p{N} _-]+$/u.test(n)&&n.includes(' '))return h.includes(n);if(/^[\p{L}\p{N}_-]+$/u.test(n)){try{return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(n)}(?=$|[^\\p{L}\\p{N}_])`,'iu').test(h);}catch{return h.includes(n);}}return h.includes(n);}
function escapeRegExp(s){return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');}

function profileSemanticId(profile){return normalize(profile?.id||profile?.semantics?.canonical_concept||profile?.name||'').replace(/s$/,'');}
function semanticTermForms(termInfo,profile){
  const base=normalize(termInfo?.text),lang=String(termInfo?.language||'').toLowerCase(),conceptId=normalize(termInfo?.concept_id||'');
  const forms=new Set(base?[base]:[]);if(lang!=='en'||!base)return [...forms];const pid=profileSemanticId(profile);
  // Curated morphology is intentionally concept-specific. It improves real event
  // evidence without turning arbitrary substrings into relevance signals.
  if(pid==='explosion'){
    if(conceptId==='explosion'&&base==='explosion')for(const x of ['explosions','explode','explodes','exploded','exploding'])forms.add(x);
    if(conceptId==='blast'&&base==='blast')for(const x of ['blasts','blasted','blasting'])forms.add(x);
    if(conceptId==='detonation'&&base==='detonation')for(const x of ['detonations','detonate','detonates','detonated','detonating'])forms.add(x);
  }
  if(pid==='crash'){
    if(conceptId==='crash'&&base==='crash')for(const x of ['crashes','crashed','crashing'])forms.add(x);
    if(conceptId==='collision'&&base==='collision')for(const x of ['collisions','collide','collides','collided','colliding'])forms.add(x);
    if((conceptId==='traffic-accident'||conceptId==='accident')&&base.endsWith('accident'))forms.add(`${base}s`);
    if(conceptId==='rollover'&&base==='rollover')forms.add('rolled over');
    if(conceptId==='pileup'&&base==='pileup')forms.add('pile-up');
  }
  return [...forms];
}
function semanticTermInText(text,termInfo,profile){return semanticTermForms(termInfo,profile).some((x)=>phraseInText(text,x));}
function crashContextEvidence(text){
  const s=normalize(text);
  const vehicle=/\b(?:car|cars|truck|trucks|bus|buses|van|vans|vehicle|vehicles|suv|suvs|motorcycle|motorcycles|motorbike|motorbikes|semi|semis|lorry|lorries|train|trains|aircraft|plane|planes)\b/i.test(s);
  const impact=/\b(?:hit|hits|hitting|struck|strikes|striking|rammed|rams|ramming|slammed\s+into|slams\s+into|smash(?:ed|es|ing)?\s+into|plow(?:ed|s|ing)?\s+into|plough(?:ed|s|ing)?\s+into|drift(?:ed|s|ing)?\s+into)\b/i.test(s);
  const target=/\b(?:barrier|barriers|guardrail|guardrails|guard rail|guard rails|median|medians|divider|dividers|wall|walls|pole|poles|tree|trees|vehicle|vehicles|car|cars|truck|trucks|bus|buses|van|vans|motorcycle|motorcycles|building|buildings|bridge|bridges|fence|fences|ditch|ditches|curb|curbs|kerb|kerbs|traffic light|traffic lights|road sign|road signs|pedestrian|pedestrians|cyclist|cyclists)\b/i.test(s);
  return vehicle&&impact&&target;
}
export function derivedSemanticEvidence(title,description='',profile={}){
  const titleText=String(title||''),supportText=String(description||''),combined=`${titleText} ${supportText}`;const pid=profileSemanticId(profile);
  const strongTerms=allConceptTerms(profile).filter(x=>x.acceptance==='strong');const supportingTerms=allConceptTerms(profile).filter(x=>x.acceptance==='supporting');
  const titleStrong=strongTerms.find(t=>semanticTermInText(titleText,t,profile))||null;
  const titleSupporting=supportingTerms.find(t=>semanticTermInText(titleText,t,profile))||null;
  const supportStrong=strongTerms.find(t=>semanticTermInText(supportText,t,profile))||null;
  if(titleStrong)return{kind:'term',strength:'strong',concept_id:titleStrong.concept_id,term:titleStrong.text,matched_form:semanticTermForms(titleStrong,profile).find(x=>phraseInText(titleText,x))||titleStrong.text};
  if(pid==='crash'&&crashContextEvidence(titleText))return{kind:'context',strength:'strong',concept_id:'crash',rule_id:'vehicle-impact-event',term:'vehicle + impact + physical target'};
  if(titleSupporting)return{kind:'term',strength:'supporting',concept_id:titleSupporting.concept_id,term:titleSupporting.text,matched_form:semanticTermForms(titleSupporting,profile).find(x=>phraseInText(titleText,x))||titleSupporting.text,supportStrong:Boolean(supportStrong)};
  if(supportStrong)return{kind:'description',strength:'supporting',concept_id:supportStrong.concept_id,term:supportStrong.text};
  return null;
}

const COMMON_NOISE=[...HARD_NOISE_PHRASES];
const COMMON_NOISE_RULES=[
  {id:'non-real-media',description:'synthetische/entertainmentcontent is geen real-world event'},
  {id:'intent-not-event',description:'plannen, dreigen of proberen is niet hetzelfde als een uitgevoerd event'},
];

const TRANSLATIONS = Object.freeze({
  explosion:{en:['explosion'],es:['explosión'],pt:['explosão'],fr:['explosion'],de:['Explosion'],nl:['explosie','ontploffing'],pl:['wybuch'],ru:['взрыв'],tr:['patlama'],ar:['انفجار'],id:['ledakan'],hi:['विस्फोट'],bn:['বিস্ফোরণ'],ta:['வெடிப்பு'],zh:['爆炸'],ja:['爆発'],ko:['폭발']},
  crash:{en:['crash'],es:['choque'],pt:['colisão'],fr:['collision'],de:['Zusammenstoß','Kollision'],nl:['botsing'],pl:['kolizja','zderzenie'],ru:['столкновение'],tr:['çarpışma'],ar:['تصادم'],id:['tabrakan'],hi:['टक्कर'],bn:['সংঘর্ষ'],ta:['மோதல்'],zh:['碰撞'],ja:['衝突'],ko:['충돌']},
  accident:{en:['accident'],es:['accidente'],pt:['acidente'],fr:['accident'],de:['Unfall'],nl:['ongeval'],pl:['wypadek'],ru:['авария'],tr:['kaza'],ar:['حادث'],id:['kecelakaan'],hi:['दुर्घटना'],bn:['দুর্ঘটনা'],ta:['விபத்து'],zh:['事故'],ja:['事故'],ko:['사고']},
  policeChase:{
    en:['police chase'],es:['persecución policial'],pt:['perseguição policial'],fr:['poursuite policière'],de:['Verfolgungsjagd Polizei'],nl:['politieachtervolging'],pl:['pościg policyjny'],ru:['полицейская погоня'],tr:['polis kovalamaca'],ar:['مطاردة الشرطة'],id:['kejar-kejaran polisi'],hi:['पुलिस पीछा'],bn:['পুলিশের ধাওয়া'],ta:['போலீஸ் துரத்தல்'],zh:['警方追捕'],ja:['警察 カーチェイス'],ko:['경찰 추격전']
  },
  policePursuit:{
    en:['police pursuit','vehicle pursuit'],es:['huye de la policía'],pt:['fuga da polícia'],fr:['course poursuite police'],de:['Flucht vor Polizei'],nl:['vlucht voor politie'],pl:['ucieczka przed policją'],ru:['погоня полиции'],tr:['polisten kaçış'],ar:['هروب من الشرطة'],id:['dikejar polisi'],hi:['पुलिस से भागा'],bn:['পুলিশকে ফাঁকি দিয়ে পালাল'],ta:['போலீஸ் சேஸ்'],zh:['警車追逐'],ja:['パトカー 追跡'],ko:['경찰차 추격']
  },
  war:{en:['war'],es:['guerra'],pt:['guerra'],fr:['guerre'],de:['Krieg'],nl:['oorlog'],pl:['wojna'],ru:['война'],tr:['savaş'],ar:['حرب'],id:['perang'],hi:['युद्ध'],bn:['যুদ্ধ'],ta:['போர்'],zh:['战争'],ja:['戦争'],ko:['전쟁']},
});
function translatedTerms(key){const d=TRANSLATIONS[key]||{};return Object.entries(d).flatMap(([language,values])=>(values||[]).map(x=>term(x,language)));}

const REFERENCE_SPECS = Object.freeze({
  crash:{
    id:'crash',name:'Crash',summary:'Real physical crashes and collisions. A generic accident may broaden discovery, but does not by itself establish that a crash occurred.',
    concepts:[
      concept('crash','Crash','canonical','strong','strong',translatedTerms('crash')),
      concept('collision','Collision','equivalent','strong','strong',[term('collision'),term('vehicle collision'),term('traffic collision'),term('head-on collision'),...translatedTerms('crash').filter(x=>x.language!=='en')]),
      concept('traffic-accident','Traffic / vehicle accident','subtype','strong','strong',[term('traffic accident'),term('road accident'),term('vehicle accident'),term('car accident'),term('motorcycle accident')]),
      concept('rollover','Rollover','subtype','strong','strong',[term('rollover'),term('rollover crash'),term('vehicle rollover')]),
      concept('pileup','Pileup','subtype','strong','strong',[term('pileup'),term('multi vehicle crash'),term('multi-car crash')]),
      concept('wreck','Wreck','related','secondary','supporting',[term('wreck'),term('vehicle wreck')]),
      concept('accident','Accident','broader','secondary','supporting',translatedTerms('accident'),{note:'Breder dan Crash: bruikbaar voor discovery, maar accident alleen is onvoldoende Crash-bewijs.'}),
    ],
    noise:[...COMMON_NOISE,'stock market crash','market crash','crypto crash','computer crash','server crash','software crash','app crash','website crash','system crash'],
    negative_patterns:['planned/intended crash','digital/economic crash'],
    youtubeQueries:['crash','collision','road crash','traffic collision','traffic accident','vehicle accident','rollover crash','pileup','wreck','dashcam crash','crash caught on camera','collision caught on camera','crash footage','collision footage','accident caught on camera','motorcycle crash','truck crash','bus crash','train crash','aircraft crash'],
    bitchute:{maxAge:168,maxDuration:90,hashtags:[{tag:'crash',status:'reference'},{tag:'accident',status:'reference'},{tag:'collision',status:'reference'}],fallback:['crash','collision','accident']},
  },
  explosion:{
    id:'explosion',name:'Explosion',summary:'Real physical explosions and blasts. Figurative uses, fictional entertainment and events that never occurred are excluded.',
    concepts:[
      concept('explosion','Explosion','canonical','strong','strong',translatedTerms('explosion')),
      concept('blast','Blast','equivalent','strong','strong',[term('blast')]),
      concept('detonation','Detonation','related','secondary','supporting',[term('detonation'),term('detonación','es'),term('detonação','pt'),term('detonation','fr'),term('Detonation','de'),term('detonatie','nl'),term('детонация','ru')]),
      concept('industrial-explosion','Industrial explosion','subtype','strong','strong',[term('industrial explosion'),term('factory explosion'),term('factory blast'),term('refinery explosion'),term('chemical plant explosion'),term('warehouse explosion'),term('gas explosion')]),
    ],
    noise:[...COMMON_NOISE,'population explosion','price explosion','data explosion','hiv explosion','flavor explosion','flavour explosion','color explosion','colour explosion'],
    negative_patterns:['metaphorical explosion'],
    youtubeQueries:['explosion','blast','detonation','industrial explosion','factory explosion','factory blast','gas explosion','gas blast','building explosion','building blast','warehouse explosion','warehouse blast','refinery explosion','chemical plant explosion','pipeline explosion','battery explosion','transformer explosion','vehicle explosion','explosion caught on camera','blast caught on camera','explosion caught on cctv','explosion caught on dashcam','explosion footage','blast footage'],
    bitchute:{maxAge:336,maxDuration:90,hashtags:[{tag:'explosion',status:'reference'},{tag:'blast',status:'reference-candidate'}],fallback:['explosion','blast','detonation']},
  },
  'police-chase':{
    id:'police-chase',name:'Police Chase',summary:'Real police pursuits and vehicle chases. Police-related footage without an actual pursuit is not sufficient.',
    concepts:[
      concept('police-chase','Police chase','canonical','strong','strong',translatedTerms('policeChase')),
      concept('police-pursuit','Police pursuit','equivalent','strong','strong',translatedTerms('policePursuit')),
      concept('high-speed-pursuit','High-speed pursuit','subtype','strong','strong',[term('high speed police chase'),term('high-speed police chase'),term('high speed pursuit'),term('high-speed pursuit')]),
      concept('fleeing-police','Fleeing / evading police','subtype','strong','strong',[term('fleeing police'),term('fleeing from police'),term('evading police'),term('eluding police'),term('failure to stop police')]),
      concept('pursuit-intervention','Pursuit intervention','secondary','secondary','supporting',[term('PIT maneuver'),term('spike strips'),term('stop sticks'),term('police roadblock')]),
    ],
    noise:[...COMMON_NOISE,'police simulator','police game','car simulator','driving simulator','kids cartoon','nursery rhyme'],
    negative_patterns:['police without pursuit context'],
    youtubeQueries:['police chase','police pursuit','vehicle pursuit','high speed police chase','high speed chase','high speed pursuit','police car chase','law enforcement pursuit','fleeing police','fleeing from police','evading police','eluding police','failure to stop police','traffic stop turns into chase','PIT maneuver police chase','spike strip police chase','police chase dashcam','police pursuit dashcam','police chase caught on camera','police pursuit footage','police chase crash','stolen car police chase','motorcycle police chase','impaired driver police chase','reckless driver police pursuit'],
    bitchute:{maxAge:168,maxDuration:90,hashtags:[{tag:'policechase',status:'reference'},{tag:'pursuit',status:'reference-candidate'}],fallback:['police chase','police pursuit','high speed police chase']},
  },
});

const GENERIC_KNOWLEDGE = Object.freeze({
  cctv:{
    id:'cctv',name:'CCTV',summary:'Authentic footage recorded by security or surveillance cameras, including shops, streets, public places and workplaces. Accidents are not required; camera hardware reviews and fictional recreations are outside this category.',
    concepts:[
      concept('cctv','CCTV footage','canonical','strong','strong',[
        term('CCTV'),term('CCTV footage'),term('CCTV camera footage'),term('closed circuit television'),
        term('videovigilancia','es'),term('câmera de segurança','pt'),term('vidéosurveillance','fr'),
        term('Überwachungskamera','de'),term('bewakingscamera','nl'),term('monitoring wizyjny','pl'),
        term('камера наблюдения','ru'),term('güvenlik kamerası','tr'),term('كاميرا مراقبة','ar'),
        term('kamera pengawas','id'),term('सीसीटीवी फुटेज','hi'),term('সিসিটিভি ফুটেজ','bn'),
        term('சிசிடிவி காட்சி','ta'),term('监控视频','zh'),term('防犯カメラ映像','ja'),term('CCTV 영상','ko')]),
      concept('security-camera','Security camera','equivalent','strong','strong',[
        term('security camera footage'),term('security camera video'),term('security camera captures'),
        term('surveillance camera footage'),term('surveillance footage'),term('caught on security camera'),
        term('surveillance video'),term('security footage')]),
      concept('street-surveillance','Street surveillance','subtype','strong','strong',[
        term('street CCTV'),term('traffic CCTV footage'),term('shop security camera'),term('store surveillance footage'),
        term('workplace surveillance footage'),term('doorbell security camera')]),
      concept('caught-on-camera','Caught on camera (unspecified)','broader','secondary','supporting',[
        term('caught on camera'),term('camera footage'),term('recorded on camera')],
        {note:'A camera mention without a surveillance/security source does not establish CCTV.'})
    ],
    noise:[...COMMON_NOISE,'camera review','camera reviews','camera installation','security camera setup','buy cctv','cctv price','cctv kit','security camera unboxing'],
    youtubeQueries:[
      'CCTV footage','CCTV caught on camera','real CCTV footage','security camera footage',
      'surveillance camera footage','security footage caught on camera','CCTV street footage',
      'store surveillance footage','shop CCTV caught on camera','workplace CCTV footage',
      'public CCTV footage','doorbell security camera footage','street security camera footage',
      'CCTV incident footage','security camera captures incident','viral CCTV footage'],
    bitchute:{maxAge:168,maxDuration:90,hashtags:[{tag:'cctv',status:'candidate'},{tag:'surveillance',status:'candidate'},{tag:'securitycamera',status:'candidate'}],fallback:['cctv footage','security camera footage']},
  },
  'instant-karma':{
    id:'instant-karma',name:'Instant Karma',summary:'Authentic, immediate consequences of a person’s own action, such as instant regret, payback or poetic justice. This category does not require a crash or accident and is not a general CCTV or dashcam category.',
    concepts:[
      concept('instant-karma','Instant karma','canonical','strong','strong',[
        term('instant karma'),term('instant karma caught on camera'),term('karma hits instantly'),
        term('karma instantáneo','es'),term('karma instantâneo','pt'),term('karma immédiat','fr'),
        term('sofortiges Karma','de'),term('direct karma','nl'),term('karma natychmiast','pl'),
        term('мгновенная карма','ru'),term('anında karma','tr'),term('كارما فورية','ar'),
        term('karma instan','id')]),
      concept('instant-regret','Instant regret','equivalent','strong','strong',[
        term('instant regret'),term('immediate regret'),term('regretted it instantly'),
        term('instantly regrets it')]),
      concept('instant-payback','Instant payback','related','strong','strong',[
        term('instant payback'),term('instant justice'),term('immediate consequences'),
        term('karma strikes back'),term('karma strikes immediately')]),
      concept('generic-karma','Karma alone','broader','secondary','supporting',[
        term('karma'),term('payback'),term('poetic justice')],
        {note:'Generic karma/revenge discussion is not independently sufficient.'})
    ],
    noise:[...COMMON_NOISE,'karma yoga','karma meditation','karma astrology','karma reading','karma song','karma lyrics'],
    youtubeQueries:[
      'instant karma','instant karma caught on camera','instant karma moments',
      'instant karma real life','instant karma fails','instant regret caught on camera',
      'instant regret moment','instant karma road rage','instant karma bad drivers',
      'instant karma parking','instant karma thief','instant karma bully',
      'instant payback caught on camera','instant justice caught on camera',
      'immediate consequences caught on camera','karma strikes back real life'],
    bitchute:{maxAge:168,maxDuration:90,hashtags:[{tag:'instantkarma',status:'candidate'},{tag:'instantregret',status:'candidate'}],fallback:['instant karma','instant regret']},
  },
  dashcam:{
    id:'dashcam',name:'Dashcam',summary:'Authentic footage captured by vehicle dashboard or windscreen cameras, including driving incidents, close calls, unusual road events and road rage. A crash is not required; driving simulators and product reviews do not qualify.',
    concepts:[
      concept('dashcam','Dashcam footage','canonical','strong','strong',[
        term('dashcam'),term('dash cam'),term('dash camera'),term('dashcam footage'),
        term('cámara de salpicadero','es'),term('câmera veicular','pt'),term('caméra embarquée','fr'),
        term('Dashcam Aufnahme','de'),term('dashcam beelden','nl'),term('wideorejestrator','pl'),
        term('видеорегистратор','ru'),term('araç kamerası','tr'),term('كاميرا السيارة','ar'),
        term('kamera dasbor','id'),term('डैशकैम वीडियो','hi'),term('ড্যাশক্যাম ফুটেজ','bn'),
        term('டாஷ்கேம் வீடியோ','ta'),term('行车记录仪','zh'),term('ドライブレコーダー','ja'),term('블랙박스 영상','ko')]),
      concept('dashboard-camera','Dashboard camera','equivalent','strong','strong',[
        term('dashboard camera footage'),term('vehicle camera footage'),term('windscreen camera footage'),
        term('car dashcam video'),term('truck dashcam video'),term('motorcycle dashcam video')]),
      concept('dashcam-events','Dashcam road footage','subtype','strong','strong',[
        term('dashcam close call'),term('dashcam road rage'),term('dashcam near miss'),
        term('dashcam bad drivers'),term('dashcam unusual road event')]),
      concept('driving-footage','Driving footage (camera unspecified)','broader','secondary','supporting',[
        term('driving footage'),term('caught on the road'),term('road footage')],
        {note:'General driving footage is not necessarily captured by a dashcam.'})
    ],
    noise:[...COMMON_NOISE,'dashcam review','dash cam review','dashcam test','best dashcam','dashcam unboxing','dashcam installation','install dashcam','dashcam setup'],
    youtubeQueries:[
      'dashcam footage','real dashcam footage','dash cam caught on camera',
      'dashcam road rage','dashcam close call','dashcam near miss',
      'dashcam bad drivers','dashcam incident','dashcam driving footage',
      'truck dashcam footage','car dashcam video','motorcycle dashcam footage',
      'dashcam unusual road events','dashcam pedestrian close call',
      'dashcam dangerous driving','dashcam accident','dashcam crash'],
    bitchute:{maxAge:168,maxDuration:90,hashtags:[{tag:'dashcam',status:'candidate'},{tag:'dashcamfootage',status:'candidate'}],fallback:['dashcam','dashcam footage']},
  },
  accident:{
    id:'accident',name:'Accident',summary:'Real-world accidental incidents, including road and rail collisions, falls, workplace injuries, construction, machinery and falling-object accidents.',
    concepts:[
      concept('accident','Accident','canonical','strong','strong',translatedTerms('accident')),
      concept('crash','Crash','subtype','strong','strong',translatedTerms('crash')),
      concept('fall','Fall accident','subtype','strong','strong',[term('fall accident'),term('accidental fall'),term('workplace fall')]),
      concept('workplace-accident','Workplace accident','subtype','strong','strong',[term('workplace accident'),term('industrial accident')]),
      concept('construction-site-accident','Construction-site accident','subtype','strong','strong',[term('construction site accident'),term('construction accident'),term('building site accident')]),
      concept('machinery-accident','Machinery accident','subtype','strong','strong',[term('machinery accident'),term('machine accident'),term('industrial machinery accident')]),
      concept('struck-by-object','Struck-by-object accident','subtype','strong','strong',[term('struck by falling object'),term('falling object accident'),term('struck by object accident')]),
    ],
    noise:[...COMMON_NOISE],
    youtubeQueries:['accident','workplace accident','construction site accident','industrial accident','traffic accident','fall accident','machinery accident','struck by falling object'],
    bitchute:{maxAge:168,maxDuration:90,hashtags:[{tag:'accident',status:'candidate'},{tag:'crash',status:'candidate'}],fallback:['accident','workplace accident']},
  },
  war:{
    id:'war',name:'War',summary:'Current, real-world warfare and combat events. Opinion, video games and historical documentaries do not automatically qualify as current events.',
    concepts:[
      concept('war','War','canonical','strong','strong',translatedTerms('war')),
      concept('armed-conflict','Armed conflict','equivalent','secondary','supporting',[term('armed conflict'),term('warfare')]),
      concept('combat','Combat / battle','related','secondary','supporting',[term('combat'),term('battle'),term('fighting')],{note:'Discovery/support only. Generic combat wording is not sufficient for HIGH War relevance.'}),
    ],
    noise:[...COMMON_NOISE,'war game','war games','war dogs','warzone','historical documentary','cold war documentary','world war z','call of duty','modern warfare','battle cats','battle of the bands'],
    youtubeQueries:['war','combat footage','war footage','battle footage','armed conflict'],
    bitchute:{maxAge:24,maxDuration:90,hashtags:[{tag:'war',status:'reference'}],fallback:['war','combat']},
  }
});

function localSpec(topic){const k=normalize(topic).replace(/\s+/g,'-');if(REFERENCE_SPECS[k])return REFERENCE_SPECS[k];if(k==='police-chases')return REFERENCE_SPECS['police-chase'];if(k==='police-pursuit')return REFERENCE_SPECS['police-chase'];if(GENERIC_KNOWLEDGE[k])return GENERIC_KNOWLEDGE[k];return null;}

function languageCoreQueries(spec){const out=[];const seenLang=new Set();for(const c of spec.concepts||[]){if(c.tier!=='strong')continue;for(const t of c.terms||[]){if(t.language==='en'||seenLang.has(t.language))continue;seenLang.add(t.language);out.push({q:t.text,language:t.language,region:t.region||MARKET[t.language]||'GLOBAL',kind:'concept',concept_id:c.id,weight:c.relation==='canonical'?100:94});}}return out;}
function buildYouTubeDiscovery(spec){const rows=[];const seen=new Set();const add=(q,language='en',region=MARKET[language]||'US',kind='semantic',weight=90)=>{const key=`${normalize(q)}|${language}|${region}`;if(!normalize(q)||seen.has(key))return;seen.add(key);rows.push({q:String(q).trim(),language,region,kind,weight});};
  (spec.youtubeQueries||[]).forEach((q,i)=>add(q,'en','US',i<3?'core':'scenario',Math.max(60,100-i*2)));
  for(const x of languageCoreQueries(spec))add(x.q,x.language,x.region,'localized-core',x.weight);
  return {mode:'automatic',queries:rows,query_budget_full:rows.length,notes:'V6 queries zijn platform-specifieke afgeleide discoverydata; semantische concepten blijven de bron van waarheid.'};
}
function buildBitChuteDiscovery(spec){return {mode:'automatic',hashtags:clone(spec.bitchute?.hashtags||[]),categories:[],text_fallback_queries:clone(spec.bitchute?.fallback||[]),text_fallback_limit:2,notes:'Hashtags eerst; categorieën alleen na bewezen marginal yield; text search is begrensde fallback.'};}
function buildProfileFromSpec(spec,{reference=false}={}){return {
  schema_version:PROFILE_SCHEMA_VERSION,id:spec.id,name:spec.name,enabled:true,
  semantics:{intent:'real-world-event',canonical_concept:spec.id,summary:spec.summary,concepts:clone(spec.concepts||[]),noise:{phrases:unique(spec.noise||[]),rules:clone(COMMON_NOISE_RULES),semantic_rules:clone(spec.negative_patterns||[])}},
  platforms:{
    youtube:{enabled:true,limits:{max_age_hours:24,max_duration_seconds:90},discovery:buildYouTubeDiscovery(spec)},
    bitchute:{enabled:true,limits:{max_age_hours:Number(spec.bitchute?.maxAge||24),max_duration_seconds:Number(spec.bitchute?.maxDuration||90)},discovery:buildBitChuteDiscovery(spec)},
    telegram:{enabled:true,limits:{max_age_hours:24,max_duration_seconds:90},discovery:{mode:'central-sources',notes:'Telegram sources worden centraal beheerd; dit profiel bepaalt alleen semantiek en eligibility-limieten.'}},
  },
  generator:{version:'6.2.5',source:reference?'golden-reference':'local-intelligence',reference_profile:Boolean(reference),generated_at:null,research_mode:'offline'},
};}

export function getGoldenReferenceProfiles(){return ['crash','explosion','police-chase'].map(k=>buildProfileFromSpec(REFERENCE_SPECS[k],{reference:true}));}
export function buildLocalProfile(topic){const spec=localSpec(topic);if(spec)return buildProfileFromSpec(spec,{reference:Boolean(REFERENCE_SPECS[spec.id])});const clean=String(topic||'').trim();if(!clean)throw new Error('Onderwerp is leeg.');const id=normalize(clean).replace(/[^\p{L}\p{N}]+/gu,'-').replace(/^-|-$/g,'')||'profile';const generic={id,name:titleCase(clean),summary:`Real-world events involving ${clean}. Fictional, simulated or merely figurative mentions are not sufficient.`,concepts:[concept(id,titleCase(clean),'canonical','strong','strong',[term(clean)])],noise:[...COMMON_NOISE],negative_patterns:[],youtubeQueries:[clean,`${clean} caught on camera`,`${clean} footage`],bitchute:{maxAge:24,maxDuration:90,hashtags:[{tag:hashtagize(clean),status:'candidate'}],fallback:[clean]}};return buildProfileFromSpec(generic,{reference:false});}
function titleCase(s){return String(s).trim().replace(/\s+/g,' ').split(' ').map(x=>x?x[0].toLocaleUpperCase()+x.slice(1):x).join(' ');}
function hashtagize(s){return normalize(s).replace(/^#/,'').replace(/[^\p{L}\p{N}_]+/gu,'');}

export function isV6Profile(profile){return Number(profile?.schema_version)===PROFILE_SCHEMA_VERSION&&Array.isArray(profile?.semantics?.concepts)&&profile?.platforms&&typeof profile.platforms==='object';}
export function getProfilePlatform(profile,platform){return profile?.platforms?.[String(platform||'').toLowerCase()]||{};}
export function getProfileLimits(profile,platform,settings={}){const p=getProfilePlatform(profile,platform);const fallback=settings?.platform_defaults?.[String(platform||'').toLowerCase()]||settings?.scan_defaults||{};return {max_age_hours:Number(p?.limits?.max_age_hours??fallback.max_age_hours??24),max_duration_seconds:Number(p?.limits?.max_duration_seconds??fallback.max_duration_seconds??90)};}
export function allConceptTerms(profile,{acceptance=null,tier=null,language=null}={}){const out=[];for(const c of profile?.semantics?.concepts||[]){if(acceptance&&c.acceptance!==acceptance)continue;if(tier&&c.tier!==tier)continue;for(const t of c.terms||[]){if(language&&t.language!==language)continue;out.push({...t,concept_id:c.id,relation:c.relation,tier:c.tier,acceptance:c.acceptance});}}return out;}
export function strongAcceptanceTerms(profile){return allConceptTerms(profile).filter(x=>x.acceptance==='strong').map(x=>x.text);}
export function supportingAcceptanceTerms(profile){return allConceptTerms(profile).filter(x=>x.acceptance==='supporting').map(x=>x.text);}
export function discoveryTerms(profile){return allConceptTerms(profile).filter(x=>x.tier==='strong'||x.tier==='secondary').map(x=>x.text);}
export function hardNoiseMatches(text,profile=null){const phrases=profile?.semantics?.noise?.phrases||HARD_NOISE_PHRASES;return phrases.filter(p=>phraseInText(text,p));}


function warKineticEvidence(title,description=''){
  const s=normalize(`${title||''} ${description||''}`);
  const direct=[
    /\b(?:airstrike|air strike|bombardment|shelling|artillery fire|frontline fighting|missile strike|drone strike|rocket strike|tank assault|troops attack|forces attack|soldiers attack|forces capture|troops capture)\b/i,
    /\b(?:missile|missiles|drone|drones|rocket|rockets|artillery|tank|tanks|troops|forces|soldiers)\b.{0,45}\b(?:strike|strikes|struck|attack|attacks|attacked|hit|hits|destroy|destroys|destroyed|capture|captures|captured|fire|firing|killed)\b/i,
    /\b(?:strike|strikes|attack|attacks|attacked|bombardment|shelling)\b.{0,45}\b(?:base|frontline|position|positions|troops|forces|soldiers|tanks|city|village|airfield|military)\b/i,
    /\b(?:battle|fighting|combat)\b.{0,28}\b(?:erupts|erupted|breaks out|broke out|intensifies|intensified|frontline)\b/i,
    /\b(?:ataque|ataques|bombardeo|bombardeos|misil|misiles|dron|drones|artillería)\b.{0,45}\b(?:golpea|golpean|destruye|destruyen|mata|matan|ataca|atacan)\b/i,
    /\b(?:attaque|frappe|frappes|missile|drone|bombardement|artillerie)\b.{0,45}\b(?:touche|détruit|attaque|frappe|tué|tués)\b/i,
  ];
  return direct.some(re=>re.test(s));
}
function warIntentOnly(text){
  const s=normalize(text);
  return [
    /\b(?:threatens?|threatened|threatening|warns?|warned|warning|plans?|planned|planning|prepares?|prepared|preparing|could lead to|may lead to|might lead to|could start|may start|might start)\b.{0,55}\bwar\b/i,
    /\b(?:amenaza|amenazan|amenazó|advierte|advierten|planea|prepara|podría|puede)\b.{0,55}\bguerra\b/i,
    /\b(?:ameaça|ameaçam|alerta|planeja|prepara|pode)\b.{0,55}\bguerra\b/i,
    /\b(?:menace|menacent|avertit|prépare|pourrait)\b.{0,55}\bguerre\b/i,
    /\b(?:droht|warnt|plant|bereitet)\b.{0,55}\bkrieg\b/i,
    /\b(?:dreigt|waarschuwt|plant|bereidt)\b.{0,55}\boorlog\b/i,
  ].some(re=>re.test(s));
}
function warTemporalNonEvent(text){
  const s=normalize(text);
  return [
    /\b(?:pre[-\s]?war|post[-\s]?war|inter[-\s]?war)\b/i,
    /\b(?:pré|pre)[-\s]?guerre\b/i,
    /\b(?:post[-\s]?guerre|après[-\s]?guerre)\b/i,
    /\b(?:pre|pré)[-\s]?guerra\b/i,
    /\b(?:post|pos|pós)[-\s]?guerra\b/i,
    /\b(?:vorkriegs?[\p{L}-]*|nachkriegs?[\p{L}-]*)\b/iu,
    /\b(?:vooroorlogs?[\p{L}-]*|naoorlogs?[\p{L}-]*)\b/iu,
    /\b(?:przedwojenn[\p{L}-]*|powojenn[\p{L}-]*)\b/iu,
    /\b(?:довоенн[\p{L}-]*|послевоенн[\p{L}-]*)\b/iu,
    /\b(?:savaş öncesi|savaş sonrası)\b/iu,
    /(?:ما قبل الحرب|ما بعد الحرب)/u,
    /\b(?:pra[-\s]?perang|pasca[-\s]?perang|sebelum perang|setelah perang)\b/iu,
    /(?:युद्ध[-\s]?पूर्व|युद्ध के बाद)/u,
    /(?:যুদ্ধপূর্ব|যুদ্ধ-পরবর্তী|যুদ্ধ পরবর্তী)/u,
    /(?:போருக்கு முன்|போருக்குப் பின்)/u,
    /(?:战前|战后)/u,
    /(?:戦前|戦後)/u,
    /(?:전쟁 전|전쟁 후)/u,
    /\b(?:world war (?:i|ii|1|2|one|two)|ww ?[12]|first world war|second world war|great war)\b/i,
    /\b(?:primera|segunda) guerra mundial\b/i,
    /\b(?:première|seconde|deuxième) guerre mondiale\b/i,
    /\b(?:erster|ersten|erste|zweiter|zweiten|zweite) weltkrieg\b/iu,
    /\b(?:eerste|tweede) wereldoorlog\b/iu,
    /(?:第一次世界大战|第二次世界大战|第一次世界大戦|第二次世界大戦|제1차 세계대전|제2차 세계대전)/u,
    /\bcold war\b/i,
  ].some(re=>re.test(s));
}

function warMetaphorOrEntertainment(text){
  const s=normalize(text);
  return [
    /\b(?:comeback|price|prices|trade|culture|console|ratings?|streaming|brand|supermarket|rap|fan|fandom|format|browser)\s+war\b/i,
    /\bwar\s+on\s+(?:prices?|christmas|woke|drugs?)\b/i,
    /\bbattle\s+of\s+the\s+bands\b/i,
    /\b(?:battle cats|world war z|call of duty|modern warfare|war dogs|warzone)\b/i,
    /\bduelo\b.{0,45}\bguerra\b/i,
    /\b(?:rivalidad|competencia|precios?|marcas?|fans?)\b.{0,45}\bguerra\b/i,
    /\b(?:rivalité|concurrence|prix|marques?|fans?)\b.{0,45}\bguerre\b/i,
    /\b(?:preiskrieg|handelskrieg|kulturkrieg|konsolenkrieg)\b/iu,
  ].some(re=>re.test(s));
}

const WAR_ACTIVE_CONTEXT_MARKERS=Object.freeze({
  en:['latest','update','updates','development','developments','ongoing','frontline','ceasefire','invasion','offensive','missile','missiles','drone','drones','airstrike','strikes','attacks','escalation','peace talks','heating up'],
  es:['actualidad','última hora','actualización','novedades','situación','frente','alto el fuego','invasión','ofensiva','misiles','drones','ataques','conflicto','combates','escalada'],
  pt:['atualização','situação','frente','cessar-fogo','invasão','ofensiva','mísseis','drones','ataques','conflito','combates','escalada'],
  fr:['actualité','dernières nouvelles','développements','situation','front','cessez-le-feu','invasion','offensive','missiles','drones','frappes','conflit','combats','escalade'],
  de:['aktuell','neueste','lage','entwicklung','front','waffenstillstand','invasion','offensive','raketen','drohnen','angriffe','konflikt','kämpfe','eskalation'],
  nl:['actueel','laatste','update','ontwikkelingen','situatie','front','staakt-het-vuren','invasie','offensief','raketten','drones','aanvallen','conflict','gevechten','escalatie'],
  pl:['aktualizacja','najnowsze','sytuacja','front','zawieszenie broni','inwazja','ofensywa','rakiety','drony','ataki','konflikt','walki','eskalacja'],
  ru:['последние','обновление','ситуация','фронт','прекращение огня','вторжение','наступление','ракеты','дроны','атаки','конфликт','бои','эскалация'],
  tr:['güncel','son durum','cephe','ateşkes','işgal','saldırı','füze','füzeler','drone','dron','çatışma','muharebe','tırmanma'],
  ar:['آخر التطورات','تحديث','الوضع','الجبهة','وقف إطلاق النار','غزو','هجوم','صواريخ','طائرات مسيرة','هجمات','صراع','قتال','تصعيد'],
  id:['terbaru','pembaruan','situasi','garis depan','gencatan senjata','invasi','serangan','rudal','drone','konflik','pertempuran','eskalasi'],
  hi:['ताज़ा','अपडेट','स्थिति','मोर्चा','युद्धविराम','आक्रमण','हमला','मिसाइल','ड्रोन','संघर्ष','लड़ाई'],
  bn:['সর্বশেষ','আপডেট','পরিস্থিতি','ফ্রন্ট','যুদ্ধবিরতি','আক্রমণ','ক্ষেপণাস্ত্র','ড্রোন','সংঘর্ষ','লড়াই'],
  ta:['சமீபத்திய','புதுப்பிப்பு','நிலைமை','முன்னணி','போர்நிறுத்தம்','படையெடுப்பு','தாக்குதல்','ஏவுகணை','ட்ரோன்','மோதல்','சண்டை'],
  zh:['最新','局势','前线','停火','入侵','攻势','导弹','无人机','袭击','冲突','战斗','升级'],
  ja:['最新','情勢','前線','停戦','侵攻','攻勢','ミサイル','ドローン','攻撃','紛争','戦闘','激化'],
  ko:['최신','상황','전선','휴전','침공','공세','미사일','드론','공격','분쟁','전투','격화'],
});

function warContextMarkerInText(text,marker,language){
  const h=normalize(text),n=normalize(marker);
  if(!h||!n)return false;
  if(['zh','ja','ko'].includes(language))return h.includes(n);
  return phraseInText(h,n);
}

function warTermInText(text,termInfo,profile){
  const language=String(termInfo?.language||'').toLowerCase();
  if(['zh','ja','ko'].includes(language)){const h=normalize(text),n=normalize(termInfo?.text);return Boolean(h&&n&&h.includes(n));}
  return semanticTermInText(text,termInfo,profile);
}

function warStructuralContext(title,language){
  const raw=String(title||'');
  const patterns={
    en:[/\bwar\s+(?:in|with|against|between)\s+[\p{L}\p{N}.'’-]+/iu,/\b[A-Z][\p{L}\p{N}.'’-]{2,}\s+War\b/u],
    es:[/\bguerra\s+(?:en|con|contra|entre|de)\s+[\p{L}\p{N}.'’-]+/iu],
    pt:[/\bguerra\s+(?:em|no|na|com|contra|entre|de)\s+[\p{L}\p{N}.'’-]+/iu],
    fr:[/\bguerre\s+(?:en|avec|contre|entre|de)\s+[\p{L}\p{N}.'’-]+/iu],
    de:[/\b[A-ZÄÖÜ][\p{L}\p{N}.'’-]{2,}-Krieg\b/u,/\bKrieg\s+(?:in|gegen|zwischen)\s+[\p{L}\p{N}.'’-]+/iu],
    nl:[/\boorlog\s+(?:in|met|tegen|tussen)\s+[\p{L}\p{N}.'’-]+/iu],
    pl:[/\bwojna\s+(?:w|z|przeciwko|między)\s+[\p{L}\p{N}.'’-]+/iu],
    ru:[/\bвойна\s+(?:в|с|против|между)\s+[\p{L}\p{N}.'’-]+/iu],
    tr:[/\bsavaş\s+(?:ile|arasında|karşı)\s+[\p{L}\p{N}.'’-]+/iu],
    ar:[/(?:حرب في|حرب مع|حرب ضد|حرب بين)\s*[\p{L}\p{N}.'’-]+/u],
    id:[/\bperang\s+(?:di|dengan|melawan|antara)\s+[\p{L}\p{N}.'’-]+/iu],
  };
  return (patterns[language]||[]).some(re=>re.test(raw));
}

function warCurrentTopicEvidence(title,description='',profile={}){
  const combined=`${title||''} ${description||''}`;
  const matched=allConceptTerms(profile).filter(t=>t.concept_id==='war'&&warTermInText(combined,t,profile));
  if(!matched.length)return false;
  for(const t of matched){
    const language=String(t.language||'').toLowerCase();
    if(warStructuralContext(title,language))return true;
    if((WAR_ACTIVE_CONTEXT_MARKERS[language]||[]).some(marker=>warContextMarkerInText(combined,marker,language)))return true;
  }
  return false;
}

function assessWarContent(title,description='',profile={}){
  const combined=`${title||''} ${description||''}`;
  const noise=hardNoiseMatches(combined,profile);
  if(noise.length)return{relevance:'UNCERTAIN',accept:false,reason:`noise: ${noise[0]}`,evidence:null};
  if(warTemporalNonEvent(combined))return{relevance:'UNCERTAIN',accept:false,reason:'pre-/post-war, Cold War of andere niet-actuele War-context is geen actuele uitgevoerde oorlogshandeling',evidence:null};
  if(warMetaphorOrEntertainment(combined))return{relevance:'UNCERTAIN',accept:false,reason:'niet-kinetisch, entertainment- of metaforisch War-gebruik',evidence:null};
  if(warIntentOnly(combined)&&!warKineticEvidence(title,description))return{relevance:'UNCERTAIN',accept:false,reason:'oorlog wordt bedreigd/verwacht/gepland, niet als uitgevoerd kinetisch event beschreven',evidence:null};
  if(warKineticEvidence(title,description))return{relevance:'HIGH',accept:true,reason:'expliciet kinetisch oorlogs-/gevechtsevent',evidence:{kind:'context',strength:'strong',concept_id:'war',rule_id:'war-kinetic-event'}};
  if(warCurrentTopicEvidence(title,description,profile))return{relevance:'MEDIUM',accept:true,reason:'expliciete actuele oorlog/conflictcontext zonder duidelijke nieuwe kinetische handeling',evidence:{kind:'context',strength:'supporting',concept_id:'war',rule_id:'war-current-topic'}};
  const titleText=String(title||'');
  if(/\b(?:armed conflict|warfare)\b/i.test(normalize(titleText)))return{relevance:'MEDIUM',accept:true,reason:'expliciete gewapende-conflictcontext',evidence:{kind:'term',strength:'supporting',concept_id:'armed-conflict'}};
  const warTerms=allConceptTerms(profile).filter(t=>t.concept_id==='war');
  if(warTerms.some(t=>warTermInText(titleText,t,profile)))return{relevance:'UNCERTAIN',accept:false,reason:'oorlogsterm aanwezig maar onvoldoende actuele conflict-/eventcontext',evidence:{kind:'term',strength:'supporting',concept_id:'war'}};
  if(/\b(?:battle|combat|fighting)\b/i.test(normalize(titleText)))return{relevance:'UNCERTAIN',accept:false,reason:'combat/battle/fighting zonder voldoende oorlogs- of eventcontext',evidence:{kind:'term',strength:'supporting',concept_id:'combat'}};
  return{relevance:'UNCERTAIN',accept:false,reason:'geen voldoende War-eventbewijs',evidence:null};
}

function negativeSemanticReason(text,profile){const s=normalize(text);const id=normalize(profile?.id||profile?.semantics?.canonical_concept||profile?.name||'').replace(/s$/,'');
  if(id==='crash'){
    if(/\b(?:try|tries|tried|trying|attempt|attempts|attempted|attempting|want|wants|wanted|planning|planned|plans|plot|plots|plotted|plotting|threaten|threatens|threatened|threatening)\s+(?:to\s+)?(?:cause\s+)?(?:a\s+)?crash\b/i.test(s))return 'crash wordt alleen gepland/geprobeerd, niet als uitgevoerd event beschreven';
    if(/\b(?:stock|market|crypto|bitcoin|computer|server|software|app|website|system|economy|economic)\s+crash(?:es|ed|ing)?\b/i.test(s))return 'niet-fysiek crashgebruik';
  }
  if(id==='explosion'){
    if(/\b(?:population|price|prices|cost|costs|data|hiv|cases|flavor|flavour|color|colour)\s+(?:explosion|explosions|explode|explodes|exploded|exploding)\b/i.test(s))return 'metaforisch/non-event explosiongebruik';
    if(/\b(?:anti[-\s]?explosion|explosion[-\s]?proof|blast[-\s]?proof|blast[-\s]?resistant|explosion[-\s]?resistant|explosion protection|anti[-\s]?blast)\b/i.test(s))return 'explosionterm beschrijft bescherming/producteigenschap, niet een uitgevoerd explosie-event';
  }
  if(id==='war'){
    if(warTemporalNonEvent(s))return 'pre-/post-war, Cold War of andere niet-actuele War-context is geen actuele uitgevoerde oorlogshandeling';
    if(warMetaphorOrEntertainment(s))return 'niet-kinetisch, entertainment- of metaforisch War-gebruik';
    if(warIntentOnly(s)&&!warKineticEvidence(s,''))return 'oorlog wordt bedreigd/verwacht/gepland, niet als uitgevoerd kinetisch event beschreven';
  }
  return null;
}
export function eventIntentAssessment(title,description='',profile={}){const titleText=String(title||''),supportText=String(description||'');const combined=`${titleText} ${supportText}`;const noise=hardNoiseMatches(combined,profile);if(noise.length)return{reject:true,reason:`noise: ${noise[0]}`,titleStrong:false,titleSupporting:false,supportStrong:false,evidence:null};const negative=negativeSemanticReason(combined,profile);if(negative)return{reject:true,reason:negative,titleStrong:false,titleSupporting:false,supportStrong:false,evidence:null};
  const evidence=derivedSemanticEvidence(titleText,supportText,profile);const titleStrong=evidence?.strength==='strong'&&(evidence.kind==='term'||evidence.kind==='context');const titleSupporting=evidence?.strength==='supporting'&&evidence.kind==='term';const strongTerms=allConceptTerms(profile).filter(x=>x.acceptance==='strong');const supportStrong=strongTerms.some(t=>semanticTermInText(supportText,t,profile));
  return{reject:false,reason:null,titleStrong,titleSupporting,supportStrong,evidence};}
export function assessProfileContent(title,description='',profile={}){if(profileSemanticId(profile)==='war')return assessWarContent(title,description,profile);const intent=eventIntentAssessment(title,description,profile);if(intent.reject)return{relevance:'UNCERTAIN',accept:false,reason:intent.reason,evidence:null};if(intent.titleStrong)return{relevance:'HIGH',accept:true,reason:intent.evidence?.kind==='context'?'sterk contextueel eventbewijs in titel':`sterk semantisch concept in titel${intent.evidence?.matched_form&&normalize(intent.evidence.matched_form)!==normalize(intent.evidence.term)?` (${intent.evidence.matched_form})`:''}`,evidence:intent.evidence};const matchedSupporting=(profile?.semantics?.concepts||[]).filter(c=>c.acceptance==='supporting'&&(c.terms||[]).some(t=>semanticTermInText(title,{...t,concept_id:c.id},profile)));if(matchedSupporting.some(c=>c.relation!=='broader'))return{relevance:'MEDIUM',accept:true,reason:'secundair semantisch concept in titel',evidence:intent.evidence};if(matchedSupporting.length&&intent.supportStrong)return{relevance:'MEDIUM',accept:true,reason:'breder concept in titel met sterk ondersteunend profielbewijs',evidence:intent.evidence};if(matchedSupporting.length)return{relevance:'UNCERTAIN',accept:false,reason:'breder concept is alleen onvoldoende acceptatiebewijs',evidence:intent.evidence};return{relevance:'UNCERTAIN',accept:false,reason:'geen voldoende semantisch titelbewijs',evidence:null};}

export function getYouTubeQueries(profile){if(isV6Profile(profile))return clone(profile?.platforms?.youtube?.discovery?.queries||[]);return [];}
export function getBitChuteHashtags(profile){if(isV6Profile(profile))return clone(profile?.platforms?.bitchute?.discovery?.hashtags||[]).map(x=>typeof x==='string'?{tag:x,status:'configured'}:x).filter(x=>x?.tag);return [];}
export function getBitChuteTextFallbackQueries(profile){return isV6Profile(profile)?clone(profile?.platforms?.bitchute?.discovery?.text_fallback_queries||[]):[];}
export function deriveBitChuteCategories(profile){return isV6Profile(profile)?unique(profile?.platforms?.bitchute?.discovery?.categories||[]):unique(profile?.bitchute_categories||[]);}

export function temporalSpecificityReason(query){const q=String(query||'');if(/\b(?:19|20)\d{2}\b/.test(q))return 'expliciet jaar';if(/\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(q))return 'expliciete maand';if(/\b(?:0?[1-9]|[12]\d|3[01])[\/.\-](?:0?[1-9]|1[0-2])(?:[\/.\-](?:\d{2}|\d{4}))?\b/.test(q)||/\b(?:0?[1-9]|1[0-2])[\/.\-](?:0?[1-9]|[12]\d|3[01])(?:[\/.\-](?:\d{2}|\d{4}))?\b/.test(q))return 'numerieke datum/eventmarkering';return null;}
export function durabilityScore(query){return temporalSpecificityReason(query)?20:100;}
export function softNoiseMatches(){return [];}
export function buildOfflineCandidates(topic){const p=buildLocalProfile(topic);return getYouTubeQueries(p).map((x,i)=>({query:x.q,source:'v6-semantic',weight:x.weight??Math.max(40,100-i)}));}
export function buildOfflineMultilingual(topic){const p=buildLocalProfile(topic);return getYouTubeQueries(p).filter(x=>x.language!=='en').map(x=>({q:x.q,language:x.language,region:x.region}));}
export function resolveLocalConcept(topic){const p=buildLocalProfile(topic);return{key:p.id,canonical:p.semantics.canonical_concept,profile:p};}

export function migrateLegacyProfile(profile){if(isV6Profile(profile))return clone(profile);const n=normalize(profile?.name);if(['crash'].includes(n)){const p=buildLocalProfile('crash');p.enabled=profile?.enabled!==false;return p;}if(['explosion'].includes(n)){const p=buildLocalProfile('explosion');p.enabled=profile?.enabled!==false;return p;}if(['police chases','police chase'].includes(n)){const p=buildLocalProfile('police chase');p.enabled=profile?.enabled!==false;return p;}
  const p=buildLocalProfile(profile?.name||'Unnamed profile');p.enabled=profile?.enabled!==false;p.generator.source='legacy-migration';p.generator.needs_review=true;const legacyTerms=unique([...(profile?.match_terms||[]),...(profile?.medium_match_terms||[])]).filter(x=>!hardNoiseMatches(x).length);if(legacyTerms.length){const canonical=p.semantics.concepts[0];for(const x of legacyTerms.slice(0,24))if(!canonical.terms.some(t=>normalize(t.text)===normalize(x)))canonical.terms.push(term(x,'en','US'));}return p;}

export function validateV6Profile(profile){const errors=[];if(!isV6Profile(profile))errors.push('schema_version/semantics/platforms ontbreken');if(!String(profile?.id||'').trim())errors.push('id ontbreekt');if(!String(profile?.name||'').trim())errors.push('name ontbreekt');const concepts=profile?.semantics?.concepts||[];if(!concepts.some(c=>c.relation==='canonical'))errors.push('canonical concept ontbreekt');if(!concepts.some(c=>c.acceptance==='strong'))errors.push('strong acceptance concept ontbreekt');for(const c of concepts){if(!Array.isArray(c.terms)||!c.terms.length)errors.push(`concept ${c.id||'?'} heeft geen terms`);for(const t of c.terms||[]){if(!String(t.text||'').trim()||!String(t.language||'').trim())errors.push(`concept ${c.id||'?'} heeft ongeldige term`);}}for(const platform of ['youtube','bitchute','telegram']){const cfg=profile?.platforms?.[platform];if(!cfg)errors.push(`${platform} config ontbreekt`);else{const a=Number(cfg?.limits?.max_age_hours),d=Number(cfg?.limits?.max_duration_seconds);if(!(a>0))errors.push(`${platform}.limits.max_age_hours ongeldig`);if(!(d>0))errors.push(`${platform}.limits.max_duration_seconds ongeldig`);}}return errors;}

export function referenceInvariantReport(profile){const errors=validateV6Profile(profile);const languages=new Set(allConceptTerms(profile,{tier:'strong'}).map(x=>x.language));return{profile:profile?.name,errors,strong_languages:[...languages],youtube_queries:getYouTubeQueries(profile).length,bitchute_hashtags:getBitChuteHashtags(profile).map(x=>x.tag)};}
