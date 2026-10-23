import {assessProfileContent,getYouTubeQueries} from '../shared/profile-intelligence.mjs';
import {classifyYouTubePopularity,normalizeYouTubeRankingConfig} from '../shared/ranking-contract.mjs';
export const MAX_QUERIES=10;
export const safeName = (s)=>String(s||'Video').replace(/[<>:"/\\|?*\x00-\x1F]/g,'-').replace(/[. ]+$/,'').slice(0,96)||'Video';
export const ageHours=(date,now=Date.now())=>Math.max(0,(now-Date.parse(date))/3600000);
export function isoDuration(s){const m=/^P(?:\d+D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(s||''));return m?Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0):null;}
export function chooseQueries(profile,n=5){return [...getYouTubeQueries(profile)].sort((a,b)=>(Number(b.weight)||0)-(Number(a.weight)||0)).slice(0,Math.max(1,Math.min(MAX_QUERIES,Number(n)||5)));}
export function rankMobileVideo(meta,profile,config,now=Date.now()){
 const title=String(meta.title||''),description=String(meta.description||'');
 const assessed=assessProfileContent(title,description,profile);
 const age=ageHours(meta.publishedAt,now),duration=meta.durationSeconds;
 const maxAge=Number(profile.platforms?.youtube?.limits?.max_age_hours||24),maxDuration=Number(profile.platforms?.youtube?.limits?.max_duration_seconds||90);
 const eligible=Number.isFinite(age)&&age<=maxAge&&Number.isFinite(duration)&&duration<=maxDuration&&Boolean(assessed.accept);
 const views=Number.isFinite(Number(meta.views))?Number(meta.views):null;
 const velocity=views!=null&&age>0?views/age:null;
 const popularity=classifyYouTubePopularity({views,velocityPerHour:velocity,relevance:assessed.relevance,eligibility:eligible,config:normalizeYouTubeRankingConfig(config)});
 // Browser search does not replicate full desktop visual-evidence assessment.
 // Never publish as a verified qualified desktop ranking.
 return {Profile:profile.name,ProfileId:profile.id,Platform:'youtube',VideoId:meta.videoId,URL:`https://www.youtube.com/watch?v=${meta.videoId}`,Title:title,Description:description,PublishedAt:meta.publishedAt,PublishedAtPrecision:'EXACT',AgeHours:Number(age.toFixed(2)),Views:views,VelocityPerHour:velocity==null?null:Number(velocity.toFixed(2)),DurationSeconds:duration,ThumbnailUrl:meta.thumbnail||'',Relevance:assessed.relevance,RelevanceReason:assessed.reason,ResultStatus:eligible?'UNCERTAIN':'NONE',SuggestedPopularity:popularity.status,MobileUnverified:true,Qualified:false,Accepted:false,DiscoverySource:'YOUTUBE_DATA_API',MobileEligibility:eligible,QueryHitCount:meta.hits||1};
}
async function json(url,signal){const r=await fetch(url,{signal,cache:'no-store'});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data?.error?.message||`YouTube API HTTP ${r.status}`);return data;}
export async function discoverYoutube({key,profile,config,limit=5,onProgress=()=>{},signal}){
 if(!/^[-\w]{10,200}$/.test(String(key||'')))throw new Error('Enter a valid YouTube Data API key.');
 const queries=chooseQueries(profile,limit),ids=new Map();const now=Date.now();let searched=0;
 for(const query of queries){
   if(signal?.aborted)throw new DOMException('Scan cancelled','AbortError');
   const u=new URL('https://www.googleapis.com/youtube/v3/search');u.search=new URLSearchParams({part:'snippet',type:'video',maxResults:'50',order:'date',publishedAfter:new Date(now-Number(profile.platforms.youtube.limits.max_age_hours||24)*3600000).toISOString(),q:query.q,regionCode:/^[A-Z]{2}$/.test(query.region)?query.region:'US',key}).toString();
   const page=await json(u,signal);
   for(const item of page.items||[]){const id=item.id?.videoId;if(!/^[a-zA-Z0-9_-]{11}$/.test(id||''))continue;const previous=ids.get(id);if(previous){previous.hits++;continue;}ids.set(id,{videoId:id,title:item.snippet?.title||'',description:item.snippet?.description||'',publishedAt:item.snippet?.publishedAt,thumbnail:item.snippet?.thumbnails?.medium?.url||'',hits:1});}
   onProgress({completed:++searched,total:queries.length,candidates:ids.size,query:query.q});
 }
 const videos=[...ids.values()];for(let i=0;i<videos.length;i+=50){const part=videos.slice(i,i+50),u=new URL('https://www.googleapis.com/youtube/v3/videos');u.search=new URLSearchParams({part:'contentDetails,statistics,snippet',id:part.map(v=>v.videoId).join(','),key}).toString();const page=await json(u,signal),detail=new Map((page.items||[]).map(v=>[v.id,v]));for(const candidate of part){const d=detail.get(candidate.videoId);if(!d){candidate.unavailable=true;continue;}candidate.views=d.statistics?.viewCount??null;candidate.durationSeconds=isoDuration(d.contentDetails?.duration);candidate.title=d.snippet?.title||candidate.title;candidate.description=d.snippet?.description||candidate.description;candidate.publishedAt=d.snippet?.publishedAt||candidate.publishedAt;}}
 return videos.filter(v=>!v.unavailable).map(v=>rankMobileVideo(v,profile,config,now)).filter(r=>r.MobileEligibility).sort((a,b)=>{const s={VIRAL:0,RISING:1,WATCHLIST:2,NONE:3};return (s[a.SuggestedPopularity]??3)-(s[b.SuggestedPopularity]??3)||b.Views-a.Views;});
}
