const prefix = "editions/";
const sourcePrefix = "headline-days/";
const allow = new Set(["ai","software","security","hardware","mobile","companies","career","turkey","space","research","games","cloud","policy"]);
const maxBytes = 256 * 1024;
const dataDate = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value+"T00:00:00Z");
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0,10) === value;
};
function followingDay(day) {
  const date = new Date(day+"T00:00:00Z");
  date.setUTCDate(date.getUTCDate()+1);
  return date.toISOString().slice(0,10);
}
function articleUrlKey(value) {
  const url = new URL(value);
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_|^(trk|ref|fbclid|gclid|amp)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, "") + url.search;
}
function articleTitleKey(title, source) {
  const key = title.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "").replace(/ı/g, "i")
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return key.split(" ").length < 5 ? source + " " + key : key;
}
const shortText = (text, max) => typeof text === "string" && text.trim().length > 0 && text.length <= max;
const validCopy = copy => copy && shortText(copy.title,240) && shortText(copy.summary,1300) && shortText(copy.why,800);
function validUrl(value) {
  if (!shortText(value,2000)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}
function validPublicLink(value) {
  if(!shortText(value,3000))return false;
  try {
    const url=new URL(value);
    return /^https?:$/.test(url.protocol)&&!url.username&&!url.password;
  } catch {return false;}
}
function validLocalization(value) {
  if(!value||typeof value!=="object"||Array.isArray(value))return false;
  return Object.entries(value).every(([lang,copy])=>
    (lang==="tr"||lang==="en")&&copy&&typeof copy==="object"&&!Array.isArray(copy)&&
    (copy.title===undefined||shortText(copy.title,2500))&&(copy.summary===undefined||shortText(copy.summary,1200)));
}
function validEdition(input) {
  if (!input || !dataDate(input.date) || !Array.isArray(input.stories) || input.stories.length > 75) return false;
  const ids = new Set();
  for (const story of input.stories) {
    if (!story || !shortText(story.id,120) || ids.has(story.id) || !dataDate(story.date)) return false;
    if (!Array.isArray(story.categories) || !story.categories.length || story.categories.some(value => !allow.has(value))) return false;
    if (!validCopy(story.tr) || !validCopy(story.en)) return false;
    if (!Array.isArray(story.sources) || !story.sources.length || story.sources.length > 12 ||
        story.sources.some(source => !source || !shortText(source.name,100) || !validUrl(source.url))) return false;
    ids.add(story.id);
  }
  return true;
}
function json(data, status=200) {
  return Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
}
async function editions(request, bucket, url) {
  if (!bucket) return json({error:"Archive storage unavailable"},503);
  if (request.method === "GET") {
    const cursor = url.searchParams.get("cursor") || undefined;
    const page = await bucket.list({prefix,limit:20,cursor});
    const rows = await Promise.all(page.objects.map(async object => {
      const stored = await bucket.get(object.key);
      return stored && stored.json();
    }));
    return json({editions:rows.filter(Boolean),cursor:page.truncated ? page.cursor : null});
  }
  // Private Sites authenticates its owner or approved service caller before forwarding.
  if (request.method === "PUT") {
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return json({error:"Origin rejected"},403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({error:"Use application/json"},415);
    if (Number(request.headers.get("content-length")) > maxBytes) return json({error:"Edition too large"},413);
    const body = await request.text();
    if (new TextEncoder().encode(body).length > maxBytes) return json({error:"Edition too large"},413);
    let input;
    try { input = JSON.parse(body); } catch { return json({error:"Invalid JSON"},400); }
    if (!validEdition(input)) return json({error:"Invalid bilingual edition"},400);
    const reversed = 99999999 - Number(input.date.replaceAll("-",""));
    await bucket.put(prefix+reversed,JSON.stringify(input),{httpMetadata:{contentType:"application/json"}});
    return json({date:input.date,stories:input.stories.length});
  }
  return json({error:"Method not allowed"},405);
}
async function sourceDays(request,bucket,url) {
  if(!bucket)return json({error:"Archive storage unavailable"},503);
  const dayKey=day=>sourcePrefix+(99999999-Number(day.replaceAll("-","")));
  if(request.method==="GET"){
    const date=url.searchParams.get("date");
    if(date){
      if(!dataDate(date))return json({error:"Invalid date"},400);
      const object=await bucket.get(dayKey(date));
      return json({days:object?[await object.json()]:[],cursor:null});
    }
    if(url.searchParams.has("dates")){
      const dates=[];
      let cursor;
      for(;;){
        const page=await bucket.list({prefix:sourcePrefix,limit:1000,cursor});
        for(const {key} of page.objects){
          const value=String(99999999-Number(key.slice(sourcePrefix.length))).padStart(8,"0");
          const day=value.slice(0,4)+"-"+value.slice(4,6)+"-"+value.slice(6);
          if(dataDate(day))dates.push(day);
        }
        if(!page.truncated||!page.cursor||page.cursor===cursor)break;
        cursor=page.cursor;
      }
      return json({dates});
    }
    const cursor=url.searchParams.get("cursor")||undefined;
    const page=await bucket.list({prefix:sourcePrefix,limit:5,cursor});
    const rows=await Promise.all(page.objects.map(async object=>{
      const stored=await bucket.get(object.key);
      return stored&&stored.json();
    }));
    return json({days:rows.filter(Boolean),cursor:page.truncated?page.cursor:null});
  }
  if(request.method!=="PUT")return json({error:"Method not allowed"},405);
  const origin=request.headers.get("origin");
  if(origin&&origin!==url.origin)return json({error:"Origin rejected"},403);
  if(!request.headers.get("content-type")?.startsWith("application/json"))return json({error:"Use application/json"},415);
  const byteLimit=8*1024*1024;
  if(Number(request.headers.get("content-length"))>byteLimit)return json({error:"Source day too large"},413);
  const body=await request.text();
  if(new TextEncoder().encode(body).length>byteLimit)return json({error:"Source day too large"},413);
  let input;
  try {input=JSON.parse(body);}catch{return json({error:"Invalid JSON"},400);}
  if(!input||!dataDate(input.date)||!Number.isSafeInteger(input.total)||input.total<1||
      (input.scanDate!==undefined&&input.scanDate!==input.date&&input.scanDate!==followingDay(input.date))||
      !Number.isSafeInteger(input.dated)||input.dated<0||input.dated>input.total||
      !Number.isSafeInteger(input.unreachable)||input.unreachable<0||input.unreachable>input.total-input.dated||
      !Array.isArray(input.items)||input.items.some(row=>!Array.isArray(row)||row.length<4||row.length>6||
        row[0]!==input.date||!shortText(row[1],2000)||!validPublicLink(row[2])||!shortText(row[3],250)||
        (row.length>=5&&row[4]!==""&&!shortText(row[4],500))||
        (row.length===6&&!validLocalization(row[5])))){
    return json({error:"Invalid source headlines"},400);
  }
  const key=dayKey(input.date);
  const isCatchup=input.scanDate===followingDay(input.date);
  const fixedRows=isCatchup?JSON.parse(scanData).items.filter(row=>row[0]===input.date):[];
  if(isCatchup){
    const previousEdition=await bucket.get(prefix+key.slice(sourcePrefix.length));
    for(const story of (previousEdition?await previousEdition.json():null)?.stories||[]){
      if(story.date!==input.date)continue;
      for(const source of story.sources){
        fixedRows.push([input.date,story.tr.title,source.url,source.name], [input.date,story.en.title,source.url,source.name]);
      }
    }
  }
  for(let attempt=0;attempt<4;attempt++){
    const oldObject=await bucket.get(key);
    const previous=oldObject?await oldObject.json():{};
    const lateUrls=new Set(previous.lateUrls||[]);
    const byUrl=new Map((previous.items||[]).map(row=>[row[2],row]));
    if(isCatchup){
      const known=[...byUrl.values(),...fixedRows];
      const urls=new Set(known.map(row=>articleUrlKey(row[2])));
      const titles=new Set(known.map(row=>articleTitleKey(row[1],row[3])));
      for(const row of input.items){
        const url=articleUrlKey(row[2]);
        const title=articleTitleKey(row[1],row[3]);
        if(!urls.has(url)&&!titles.has(title))lateUrls.add(row[2]);
        urls.add(url);
        titles.add(title);
      }
    }
    for(const row of input.items){
      const old=byUrl.get(row[2]);
      const description=row[4]||old?.[4]||"";
      const localized={};
      for(const lang of ["tr","en"]){
        const prior=old?.[5]?.[lang];
        const latest=row[5]?.[lang];
        if(prior||latest)localized[lang]={...prior,...latest};
      }
      byUrl.set(row[2],Object.keys(localized).length?[...row.slice(0,4),description,localized]:
        description?[...row.slice(0,4),description]:row);
    }
    const record={date:input.date,total:input.total,dated:input.dated,unreachable:input.unreachable,items:[...byUrl.values()]};
    if(lateUrls.size)record.lateUrls=[...lateUrls];
    const onlyIf=oldObject?{etagMatches:oldObject.etag}:new Headers({"If-None-Match":"*"});
    const saved=await bucket.put(key,JSON.stringify(record),{onlyIf,httpMetadata:{contentType:"application/json"}});
    if(saved!==null)return json({date:record.date,items:record.items.length});
  }
  return json({error:"Archive update conflict. Retry the request."},409);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/editions") return editions(request,env.BUCKET,url);
    if (url.pathname === "/api/source-days") return sourceDays(request,env.BUCKET,url);
    if (url.pathname === "/archive-collector.mjs" && request.method === "GET") {
      return new Response(collector,{headers:{"Content-Type":"text/plain; charset=utf-8","X-Content-Type-Options":"nosniff","Cache-Control":"no-store"}});
    }
    if (url.pathname === "/archive-localize.py" && request.method === "GET") {
      return new Response(localizer,{headers:{"Content-Type":"text/plain; charset=utf-8","X-Content-Type-Options":"nosniff","Cache-Control":"no-store"}});
    }
    if (request.method !== "GET" && request.method !== "HEAD") return new Response(null,{status:405});
    const headers = {"X-Content-Type-Options":"nosniff","Referrer-Policy":"strict-origin-when-cross-origin"};
    if (url.pathname === "/source-inventory.txt") {
      return new Response(request.method === "HEAD" ? null : inventory,{headers:{...headers,"Content-Type":"text/plain; charset=utf-8"}});
    }
    if (url.pathname === "/archive-source-results.json") {
      return new Response(request.method === "HEAD" ? null : scanData,{headers:{...headers,"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, max-age=300"}});
    }
    if (url.pathname === "/kaynak-sonuclari") {
      const target=new URL("/"+url.search,url);
      target.searchParams.set("view","all");
      return Response.redirect(target,302);
    }
    if (url.pathname === "/") {
      return new Response(request.method === "HEAD" ? null : html,{headers:{...headers,"Content-Type":"text/html; charset=utf-8"}});
    }
    return new Response("Not found",{status:404,headers});
  }
};
