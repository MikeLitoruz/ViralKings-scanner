/** Explicit user-initiated share/export; no Microsoft OAuth or API credential needed. */
export async function shareJson(filename,data){
 const text=JSON.stringify(data,null,2),file=new File([text],filename,{type:'application/json'});
 if(navigator.canShare?.({files:[file]}) && navigator.share){
   try{await navigator.share({files:[file],title:filename});return 'shared';}
   catch(e){if(e.name==='AbortError')return 'cancelled';}
 }
 const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=filename;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);return 'downloaded';
}
