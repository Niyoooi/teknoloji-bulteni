import readline from "node:readline";
import {execFile} from "node:child_process";
import {mkdir,mkdtemp,readFile,writeFile} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {promisify} from "node:util";
import { shortSourceSummary } from "./article-summary.mjs";

const tty=process.stdin.isTTY;
if(tty)process.stdin.setRawMode(true);
const input=readline.createInterface({input:process.stdin,terminal:false});
console.log("Waiting for private site URL and key on stdin.");
const line=await new Promise(resolve=>input.once("line",resolve));
input.close();
process.stdin.pause();
if(tty)process.stdin.setRawMode(false);
const {url:siteAddress,token,date}=JSON.parse(line);
const site = new URL(siteAddress);
if(site.protocol!=="https:"||site.username||site.password||!site.hostname.endsWith(".chatgpt.site"))throw new Error("Invalid private Site URL.");
const siteHeaders={"OAI-Sites-Authorization":"Bearer "+token};
const siteRequest=(path,options={})=>fetch(new URL(path,site),{
  ...options,headers:{...siteHeaders,...options.headers},redirect:"manual",signal:AbortSignal.timeout(20000)
});
const file=await siteRequest("/source-inventory.txt");
if(!file.ok)throw new Error("Source inventory unavailable: "+file.status);
const inventory=await file.text();
const sections = inventory.split(/^OTOMATİK HABER PROJELERİ\s*$|^THISDOT BÜLTEN KATALOĞU\s*$/m).slice(1);
const groups = sections.flatMap((section,i) => section.trim().split(/\r?\n\s*\r?\n/).map(block => {
  const [name,...lines] = block.split(/\r?\n/);
  const urls = [...new Set(lines.map(line=>line.trim().match(/^https?:\/\/\S+/i)?.[0]).filter(Boolean))];
  return {name,urls,catalog:i===1};
}));
if (groups.length !== 613 || groups.some(group=>!group.urls.length)) throw new Error("Inventory did not parse into 613 source groups");
const formatDay=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Istanbul",year:"numeric",month:"2-digit",day:"2-digit"});
const now=new Date();
const finish=date || formatDay.format(now);
if(!/^\d{4}-\d{2}-\d{2}$/.test(finish))throw new Error("Invalid date");
const previous=new Date(finish+"T00:00:00Z");
previous.setUTCDate(previous.getUTCDate()-1);
const start=previous.toISOString().slice(0,10);
const htmlText = value => value
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,"$1")
  .replace(/<[^>]+>/g," ")
  .replace(/&#(x[\da-f]+|\d+);/gi,(_,v)=>{const n=v[0].toLowerCase()==="x"?Number.parseInt(v.slice(1),16):Number(v);return n>0&&n<=0x10ffff?String.fromCodePoint(n):" ";})
  .replace(/&(amp|quot|apos|lt|gt|nbsp|#39);/g,(_,v)=>({amp:"&",quot:'"',apos:"'",lt:"<",gt:">",nbsp:" ","#39":"'"}[v]))
  .replace(/\s+/g," ").trim();
const tag = (body, names) => {
  for (const name of names) {
    const match = body.match(new RegExp("<"+name+"\\b[^>]*>([\\s\\S]*?)<\\/"+name+">","i"));
    if (match) return htmlText(match[1]);
  }
  return "";
};
const attr = (tag,name) => tag.match(new RegExp("\\b"+name+"\\s*=\\s*([\\x22\\x27])([\\s\\S]*?)\\1","i"))?.[2] || "";
function publicUrl(value,base) {
  try {
    const url = new URL(value,base);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
        /^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i.test(url.hostname) ||
        /\.(local|internal)$/i.test(url.hostname)) return null;
    return url;
  } catch { return null; }
}
function windowEntry(title,link,value,summary,base) {
  const url = publicUrl(link,base);
  const time = Date.parse(value);
  if (!title || !url || !Number.isFinite(time)) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : new Date(time+3*3600000).toISOString().slice(0,10);
  if (date < start || date > finish) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (/^utm_|^ref$|^fbclid$|^gclid$/i.test(key)) url.searchParams.delete(key);
  return {date,title,url:url.href,summary:summary.slice(0,580)};
}
function parseFeed(body,base) {
  const items = [];
  let dated=0, newestDate="";
  for (const [,entry] of body.matchAll(/<(?:item|entry)\b[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi)) {
    const title = tag(entry,["title"]);
    const date = tag(entry,["published","pubDate","dc:date","updated","dcterms:issued"]);
    const validDate=Date.parse(date);
    if(Number.isFinite(validDate)) {dated++; const day=new Date(validDate).toISOString().slice(0,10); if(day>newestDate)newestDate=day;}
    const tags = [...entry.matchAll(/<link\b[^>]*>/gi)].map(match=>match[0]);
    const url = tag(entry,["link"]) || tags.map(line=>[attr(line,"rel"),attr(line,"href")]).find(([rel,href])=>href && (!rel || rel==="alternate"))?.[1] || "";
    const result = windowEntry(title,url,date,tag(entry,["description","summary","content","content:encoded"]),base);
    if (result) items.push(result);
  }
  return {items,dated,newestDate};
}
function htmlCandidates(body,base) {
  const found = [];
  let dated=0, newestDate="";
  function visit(value) {
    if (Array.isArray(value)) {for (const item of value) visit(item);return;}
    if (!value || typeof value!=="object") return;
    const date = value.datePublished ?? value.dateCreated;
    const time=Date.parse(date);
    if (typeof date==="string" && Number.isFinite(time) && (value.headline || value.name)) {
      dated++;
      const day=new Date(time).toISOString().slice(0,10); if(day>newestDate)newestDate=day;
      const url = value.url || value.mainEntityOfPage?.["@id"] || (value.headline ? base : "");
      const result = windowEntry(value.headline || value.name,url,date,htmlText(value.description || ""),base);
      if (result) found.push(result);
    }
    for (const key of ["@graph","itemListElement","item","mainEntity","mainEntityOfPage","hasPart"]) visit(value[key]);
  }
  for (const m of body.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {visit(JSON.parse(m[1]));} catch {}
  }
  const alternatives=[...body.matchAll(/<link\b[^>]*>/gi)].map(m=>m[0]).filter(line=>
    /alternate/i.test(attr(line,"rel")) && /(?:rss|atom)\+xml/i.test(attr(line,"type")))
    .map(line=>publicUrl(attr(line,"href"),base)?.href).filter(Boolean).slice(0,2);
  return {items:found,dated,newestDate,alternatives};
}
const cache=new Map();
function fetchPublic(value) {
  if (!cache.has(value)) cache.set(value,(async()=>{
    let url=publicUrl(value);
    const signal=AbortSignal.timeout(8500);
    for(let i=0;i<4&&url;i++){
      const response=await fetch(url,{redirect:"manual",signal,headers:{"User-Agent":"TechnologyBrief RSS reader/1.0","Accept":"application/rss+xml, application/atom+xml, application/json, text/html;q=0.8, */*;q=0.5"}});
      if (response.status>=300&&response.status<400) {await response.body?.cancel();url=publicUrl(response.headers.get("location")||"",url);continue;}
      if (!response.ok) {await response.body?.cancel();return {status:"HTTP "+response.status};}
      const contentType=response.headers.get("content-type")||"";
      if (/^(image|video|audio)\/|pdf|octet-stream/i.test(contentType)) {await response.body?.cancel();return {status:"unsupported content"};}
      const reader=response.body?.getReader(), decoder=new TextDecoder();
      let body="", length=0;
      if (reader) for(;;){
        const part=await reader.read();
        if(part.done){body+=decoder.decode();break;}
        body+=decoder.decode(part.value,{stream:true});length+=part.value.byteLength;
        if(length>=800000){await reader.cancel();break;}
      }
      return {status:"fetched",body,url:url.href};
    }
    return {status:"redirect unavailable"};
  })().catch(error=>({status:error.name==="TimeoutError"?"timeout":(error.cause?.code||error.name)})));
  return cache.get(value);
}
function firstChoice(value) {
  const url=publicUrl(value);
  if(!url)return value;
  if(url.hostname==="github.com" && /^\/[^/]+\/[^/]+\/?$/.test(url.pathname)) url.pathname=url.pathname.replace(/\/$/,"")+"/releases.atom";
  if(/(?:^|\.)reddit\.com$/.test(url.hostname) && /^\/r\/[^/]+\/?$/i.test(url.pathname)) url.pathname=url.pathname.replace(/\/$/,"")+"/.rss";
  return url.href;
}
async function scan(group) {
  const attempts=[];
  const tried=new Set();
  let didReach=false;
  const resultItem = (status,parsed) => ({name:group.name,catalog:group.catalog,status,attempts,items:parsed.items,dated:parsed.dated,newestDate:parsed.newestDate});
  const read = async value => {
    if(tried.has(value))return null;
    tried.add(value);
    const result=await fetchPublic(value);
    attempts.push({url:value,status:result.status});
    if(!result.body)return null;
    didReach=true;
    if(/<(?:rss|feed)\b/i.test(result.body.slice(0,500))) return {kind:"feed",...parseFeed(result.body,result.url)};
    return {kind:"html",...htmlCandidates(result.body,result.url)};
  };
  const retry=process.argv.includes("--retry");
  for (const value of group.urls) {
    const url=firstChoice(value);
    const checked=await read(url);
    if (checked?.kind==="feed" && (checked.dated || !retry)) return resultItem("feed",checked);
    if (checked?.dated) return resultItem(checked.kind,checked);
    for(const alt of checked?.alternatives||[]){
      const follow=await read(alt);
      if(follow?.dated || (follow?.kind==="feed" && !retry))return resultItem(follow.kind,follow);
    }
    if(group.catalog && checked?.kind==="html" && /substack\.com\/?$|beehiiv\.com\/?$/i.test(value)){
      const follow=await read(value.replace(/\/$/,"")+(value.includes("substack")?"/feed":"/feed.xml"));
      if(follow?.kind==="feed"||follow?.dated)return resultItem(follow.kind,follow);
    }
    if(retry && checked?.kind==="html" && !checked.alternatives.length){
      const base=publicUrl(value);
      if(base && !/reddit\.com$|^(x|github)\.com$/i.test(base.hostname)){
        for (const path of ["/feed/","/rss.xml"]) {
          const follow=await read(new URL(path,base.origin).href);
          if(follow?.dated) return resultItem(follow.kind,follow);
        }
      }
    }
  }
  return {name:group.name,catalog:group.catalog,status:didReach?"no dated feed":"unreachable",attempts,items:[],dated:0,newestDate:""};
}

const block=/\b(?:exploit(?:ation)?\s+(?:code|kit|walkthrough|tutorial)|exploit\s+chains?|exploit\s+development|(?:poc|proof.of.concept).{0,45}(?:cve|zero.day|exploit)|offensive cyber automation|weaponization|bioweapon|gain.of.function|pathogen engineering)\b/i;
const results=new Array(groups.length);
let next=0,completed=0;
await Promise.all(Array.from({length:24},async()=>{
  for(;;){
    const index=next++;if(index>=groups.length)return;
    results[index]=await scan(groups[index]);
    completed++;if(completed%100===0)console.log("Sources attempted "+completed+"/"+groups.length);
  }
}));
const total=results.length;
const dated=results.filter(row=>row.dated).length;
const unreachable=results.filter(row=>row.status==="unreachable").length;
if(!dated)throw new Error("No source returned dated entries, archive was preserved.");
const days=[];
const pending=[];
for(const day of [start,finish]){
  const unique=new Set();
  const items=[];
  for(const result of results)for(const row of result.items){
    if(row.date!==day||block.test(row.title+" "+row.url)||row.title.length>2000||row.url.length>3000||result.name.length>250)continue;
    const title=row.title.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu," ").trim();
    const urlKey=row.url.replace(/^https?:\/\/(www\.)?/i,"").replace(/\/$/,"");
    const titleKey=title.split(" ").length<5?result.name+" "+title:title;
    if(unique.has(titleKey)||unique.has(urlKey))continue;
    unique.add(titleKey);unique.add(urlKey);
    const summary=shortSourceSummary(row.summary,row.title);
    items.push(summary?[day,row.title,row.url,result.name,summary]:[day,row.title,row.url,result.name]);
  }
  if(!items.length&&day!==finish)continue;
  pending.push({day,items});
}

let localized=0;
let original=pending.flatMap(entry=>entry.items);
if(original.length)try{
  const existing=new Map();
  const remember=rows=>{
    for(const row of rows||[])if(row[5])existing.set(row[2],row);
  };
  for(const {day} of pending){
    try{
      const saved=await siteRequest("/api/source-days?date="+day);
      if(saved.ok)for(const record of (await saved.json()).days||[])remember(record.items);
    }catch{}
  }
  if(pending.some(({day})=>day>="2026-11-16"&&day<="2026-11-23")){
    try{
      const baseline=await siteRequest("/archive-source-results.json");
      if(baseline.ok)remember((await baseline.json()).items);
    }catch{}
  }
  original=original.map(row=>{
    const old=existing.get(row[2]);
    if(!old||old[1]!==row[1])return row;
    const descriptionsMatch=(old[4]||"")===(row[4]||"");
    const reuse=Object.fromEntries(Object.entries(old[5]).map(([language,copy])=>
      [language,descriptionsMatch?copy:{title:copy.title}]));
    return [...row.slice(0,4),row[4]||"",reuse];
  });
  const cache=join(process.cwd(),".technology-brief-translation");
  await mkdir(cache,{recursive:true});
  const work=await mkdtemp(join(tmpdir(),"technology-brief-"));
  const script=join(work,"archive-localize.py");
  const inputPath=join(work,"sources.json");
  const outputPath=join(work,"localized.json");
  const code=await siteRequest("/archive-localize.py");
  if(!code.ok)throw new Error("Localizer is unavailable: "+code.status);
  await Promise.all([writeFile(script,await code.text()),writeFile(inputPath,JSON.stringify(original))]);
  const python=process.platform==="win32"?"python":"python3";
  await promisify(execFile)(python,[script,"--input",inputPath,"--output",outputPath,
    "--runtime",join(cache,"runtime"),"--model",join(cache,"model"),"--provision"],
    {timeout:18*60*1000,maxBuffer:2*1024*1024,windowsHide:true});
  const translated=JSON.parse(await readFile(outputPath,"utf8"));
  if(!Array.isArray(translated)||translated.length!==original.length)throw new Error("Localizer returned an incomplete archive.");
  const byDate=new Map();
  for(const row of translated){
    const day=byDate.get(row[0])||[];
    day.push(row);
    byDate.set(row[0],day);
  }
  for(const entry of pending)entry.items=byDate.get(entry.day)||entry.items;
  localized=translated.filter(row=>row[5]?.tr?.title&&row[5]?.en?.title).length;
}catch(error){
  console.error("Translation could not finish. Publishing the original headlines:",error.message);
}

for(const {day,items} of pending){
  const saved=await siteRequest("/api/source-days",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({date:day,total,dated,unreachable,items})});
  if(!saved.ok)throw new Error("Archive write failed for "+day+" ("+saved.status+")");
  const confirmed=await saved.json();
  const checked=await siteRequest("/api/source-days?date="+day);
  if(!checked.ok)throw new Error("Archive readback failed for "+day+" ("+checked.status+")");
  const readback=(await checked.json()).days.find(value=>value.date===day);
  if(!readback||readback.items.length!==confirmed.items)throw new Error("Unexpected archive readback for "+day);
  days.push({date:day,items:confirmed.items});
}
console.log(JSON.stringify({total,dated,unreachable,localized,days}));

