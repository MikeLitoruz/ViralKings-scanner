/** Mobile Telegram discovery. The only source of profile relevance is shared/profile-intelligence.mjs.
 * Uses mtcute's high-level Message, Chat and Video shapes, never Telegram auth data in OneDrive.
 */
import {assessProfileContent} from '../shared/profile-intelligence.mjs';
const str=v=>String(v??'').trim();
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const bareId=v=>str(v).replace(/^-100/, '').replace(/^-/,'');
const dateMs=v=>v instanceof Date?v.getTime():typeof v==='number'?(v>1e12?v:v*1000):Date.parse(str(v));
export function sanitizeTelegramSources(sources){
 const out=[],used=new Set();
 for(const s of Array.isArray(sources)?sources:[]){
  let item=null;
  if(typeof s==='string'){const username=s.replace(/^@/,'');if(/^[a-z0-9_]{5,32}$/i.test(username))item={type:'public',username};}
  else if(s?.type==='public'&&/^[a-z0-9_]{5,32}$/i.test(str(s.username)))item={type:'public',username:str(s.username)};
  else if(s?.type==='private'&&/^\d{5,20}$/.test(bareId(s.id)))item={type:'private',id:bareId(s.id),title:str(s.title).slice(0,120)};
  if(!item)continue;const key=item.type==='private'?'id:'+item.id:'public:'+item.username.toLowerCase();if(used.has(key))continue;
  used.add(key);out.push(item);if(out.length===50)break;
 }
 return out;
}
export function telegramVideoInfo(message){
 // mtcute Video.type is 'video', including Telegram GIF animations, which must be excluded.
 const media=message?.media;
 if(media?.type==='video'&&!media.isAnimation&&!media.isLegacyGif&&!media.isRound&&media.ttlSeconds==null){
  return {durationSeconds:num(media.duration),mimeType:str(media.mimeType)||'video/mp4',filename:str(media.fileName).slice(0,150),bytes:num(media.fileSize)};
 }
 return null;
}
function reactionCount(value){if(typeof value==='number')return value;if(Array.isArray(value))return value.reduce((n,x)=>n+(num(x?.count)||0),0);if(Array.isArray(value?.results))return value.results.reduce((n,x)=>n+(num(x?.count)||0),0);return null;}
export function mapTelegramMessage(message,source,chat,profile,now=Date.now()){
 const video=telegramVideoInfo(message);if(!video)return null;
 const stamp=dateMs(message.date),age=(now-stamp)/3600000,limits=profile?.platforms?.telegram?.limits||{};
 const maxAge=num(limits.max_age_hours)??24,maxDuration=num(limits.max_duration_seconds)??90;
 if(!Number.isFinite(age)||age<0||age>maxAge||video.durationSeconds==null||video.durationSeconds<0||video.durationSeconds>maxDuration)return null;
 const channelId=bareId(chat?.id||source.id),messageId=num(message.id),username=str(chat?.username||source.username).replace(/^@/,'');
 if(!/^\d{5,20}$/.test(channelId)||!Number.isSafeInteger(messageId)||messageId<1)return null;
 const body=str(message.text||'').slice(0,5000),first=body.split(/\r?\n/).find(s=>s.trim())?.trim(),title=(first||`Telegram video ${messageId}`).slice(0,500);
 const assessment=assessProfileContent(title,body,profile),captionless=!first;
 if(!captionless&&!assessment.accept)return null;
 const views=num(message.views),speed=views==null?null:views/Math.max(age,1/60);
 const sourceKey=source.type==='private'?`id:${source.id}`:`public:${source.username.toLowerCase()}`;
 return {Profile:profile.name,ProfileId:profile.id,Platform:'Telegram',VideoId:`tg:${channelId}:${messageId}`,URL:username?`https://t.me/${username}/${messageId}`:`https://t.me/c/${channelId}/${messageId}`,Title:title,Description:body,PublishedAt:new Date(stamp).toISOString(),AgeHours:+age.toFixed(2),DurationSeconds:video.durationSeconds,Views:views,VelocityPerHour:speed==null?null:+speed.toFixed(2),ViewsPerHour:speed==null?null:+speed.toFixed(2),TelegramForwards:num(message.forwards),TelegramComments:num(message.replies?.count??message.replies),TelegramReactions:reactionCount(message.reactions),TelegramChannelId:channelId,TelegramUsername:username,TelegramMessageId:messageId,TelegramSourceType:source.type,TelegramSourceKey:sourceKey,TelegramMimeType:video.mimeType,TelegramFileName:video.filename,TelegramFileSize:video.bytes,ChannelName:str(chat?.title||source.title||username),Relevance:assessment.relevance,RelevanceReason:captionless?'No caption; manual verification required':assessment.reason,ResultStatus:'UNCERTAIN',SuggestedPopularity:'NONE',MobileUnverified:true,Qualified:false,Accepted:false,MobileEligibility:true,DiscoverySource:'TELEGRAM_MTCUTE_BROWSER',QueryHitCount:1,TelegramSyntheticTitle:captionless};
}
export async function discoverTelegram({client,profile,sources,limitPerSource=80,signal,onProgress=()=>{},now=Date.now()}){
 if(!client||typeof client.iterHistory!=='function'||typeof client.getChat!=='function')throw Error('Telegram is not connected.');
 const selected=sanitizeTelegramSources(sources),found=new Map(),failures=[];
 if(!selected.length)throw Error('No Telegram channels configured.');
 const limit=Math.max(1,Math.min(200,Math.trunc(Number(limitPerSource)||80)));
 for(let index=0;index<selected.length;index++){
  if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
  const source=selected[index],reference=source.type==='private'?'-100'+source.id:'@'+source.username;
  try{
   const chat=await client.getChat(reference);
   for await(const message of client.iterHistory(chat.id,{limit})){
    if(signal?.aborted)throw new DOMException('Search cancelled','AbortError');
    const stamp=dateMs(message.date);if(Number.isFinite(stamp)&&now-stamp>(num(profile?.platforms?.telegram?.limits?.max_age_hours)??24)*3600000)break;
    const row=mapTelegramMessage(message,source,chat,profile,now);if(row)found.set(row.VideoId,row);
   }
  }catch(e){if(signal?.aborted)throw e;failures.push({source:source.type==='private'?(source.title||source.id):'@'+source.username,error:String(e?.message||e).slice(0,250)});}
  onProgress({completed:index+1,total:selected.length,candidates:found.size,source:source.type==='private'?(source.title||source.id):'@'+source.username,failures:failures.length});
 }
 return {rows:[...found.values()].sort((a,b)=>Date.parse(b.PublishedAt)-Date.parse(a.PublishedAt)),failures,sourceCount:selected.length};
}
