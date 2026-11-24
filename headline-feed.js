(() => {
  const copy = {
    tr:{brand:"Teknoloji Bülteni",skip:"Haberlere geç",newsNav:"Haberler",archive:"Arşiv",edition:"Haber tarihi",news:"Tüm haberler",search:"Başlık veya kaynak ara",find:"Ara",coverage:"Tarama kapsamı",noResults:"Haber bulunamadı",reset:"Filtreleri temizle",footer:"Türkiye ve dünyadan teknoloji haberleri",nav:"Gezinme",language:"Dil",categories:"Kategoriler",allDates:"Tüm tarihler",loading:"Haberler yükleniyor…",failed:"Kaynakların bir kısmı yüklenemedi.",count:(n,total)=>n===total?n+" haber":n+" / "+total+" haber",coverageText:(total,dated,missing)=>"16–23 Kasım taramasında "+total+" kaynak kaydı denendi. "+dated+" kaynakta tarihli içerik okunabildi. "+missing+" kaynağa erişilemedi. Diğer kaynaklarda tarihli içerik bulunamadı. Kaynak metinleri otomatik çevrilir. Çevirisi bulunmayan metin özgün dilinde gösterilir."},
    en:{brand:"Technology Brief",skip:"Skip to the news",newsNav:"News",archive:"Archive",edition:"News date",news:"All news",search:"Search headlines or sources",find:"Search",coverage:"Scan coverage",noResults:"No stories found",reset:"Clear filters",footer:"Technology news from Türkiye and around the world",nav:"Navigation",language:"Language",categories:"Categories",allDates:"All dates",loading:"Loading headlines…",failed:"Some sources could not be loaded.",count:(n,total)=>n===total?n+(n===1?" story":" stories"):n+" of "+total+" stories",coverageText:(total,dated,missing)=>"The 16–23 November scan attempted "+total+" source groups. Dated content was readable from "+dated+" sources, and "+missing+" could not be reached. The remaining sources exposed no dated content. Source text is machine-translated. Untranslated entries display the original text."}
  };
  const labels = {
    all:["Tümü","All"],ai:["Yapay Zekâ","AI"],software:["Yazılım","Software"],security:["Siber Güvenlik","Cybersecurity"],
    hardware:["Donanım ve Çip","Hardware & Chips"],mobile:["Mobil","Mobile"],companies:["Şirketler ve Yatırım","Business & Funding"],
    career:["Kariyer","Careers"],turkey:["Türkiye","Türkiye"],space:["Uzay","Space"],research:["Araştırma ve Robotik","Research & Robotics"],
    games:["Oyun","Gaming"],cloud:["Bulut ve Telekom","Cloud & Telecom"],policy:["Düzenlemeler","Policy"],other:["Diğer","Other"]
  };
  const copyLabels={
    tr:{source:"Kaynak açıklaması",translation:"Kaynak açıklamasının otomatik çevirisi",missing:"Bu haber için kaynak açıklaması bulunamadı."},
    en:{source:"Source description",translation:"Machine translation of the source description",missing:"A description was not available for this story."}
  };
  const viewCopy={
    tr:{label:"İçerik türleri",news:"Haberler",research:"Araştırma",releases:"Sürümler",all:"Tüm kayıtlar"},
    en:{label:"Content types",news:"News",research:"Research",releases:"Releases",all:"All records"}
  };
  const signals = {
    ai:/\b(ai|llm|gpt|claude|gemini|qwen|ollama|anthropic|openai|hugging face|inference|agentic|deepseek|llama|copilot|machine learning|yapay zek[aâ])\b/i,
    software:/\b(software|linux|git(hub|lab)?|runtime|browser|library|release|sdk|framework|package|compiler|rust|python|javascript|firefox|debian|postgresql|npm|developer|typescript|yazılım)\b/i,
    security:/\b(cve|security|secure|breach|vulnerabilit\w*|ransomware|malware|infosec|privacy|cert|patch|hack\w*|siber|gizlilik)\b/i,
    hardware:/\b(chips?|semiconductor\w*|gpu|cpu|npu|amd|nvidia|intel|hardware|qualcomm|pcie|processor\w*|snapdragon|çip|donanım)\b/i,
    mobile:/\b(mobile|android|iphone|ios|pixel|galaxy|smartphone\w*|samsung|honor|apple watch|mobil)\b/i,
    companies:/\b(funding|investment\w*|acquir\w*|acquisition|earnings|ipo|valuation|startups?|merger|raises|deal|venture capital|yatırım|girişim)\b/i,
    career:/\b(hiring|layoffs?|jobs|ceo|workforce|career|resign\w*|appoint\w*|kariyer|işten çıkarma)\b/i,
    turkey:/\b(turkey|türkiye|ankara|istanbul|i̇stanbul|konya|anadolu ajansı)\b/i,
    space:/\b(space|nasa|satellit\w*|orbital|spacex|starship|rocket\w*|ariane|uzay|uydu\w*)\b/i,
    research:/\b(research|arxiv|physic\w*|scient\w*|journal|telesurgery|cancer|medical|neural|robot\w*|health|study|paper|quantum|araştırma|sağlık)\b/i,
    games:/\b(gaming|playstation|xbox|nintendo|steam|gta|game\w*|vulkan|oyun)\b/i,
    cloud:/\b(cloud|telecom|network\w*|kubernetes|aws|azure|serverless|data centers?|datacenters?|5g|dns|bulut)\b/i,
    policy:/\b(regulat\w*|court|lawsuit|government|policy|law|copyright|fcc|doj|gdpr|düzenleme)\b/i
  };
  const $ = id => document.getElementById(id);
  const search = $("search");
  const select = $("edition");
  const filters = $("filters");
  const views = $("views");
  const container = $("stories");
  container.classList.add("headlines");
  const params = new URLSearchParams(location.search);
  let language = params.get("lang");
  if (!Object.hasOwn(copy,language)) {
    try { language = localStorage.getItem("technology-brief-language"); } catch {}
  }
  if (!Object.hasOwn(copy,language)) language = "tr";
  const dateParam = params.get("date");
  let chosenDate = dateParam === "all" || /^\d{4}-\d{2}-\d{2}$/.test(dateParam || "") ? dateParam : "latest";
  let category = Object.hasOwn(labels,params.get("category")) ? params.get("category") : "all";
  const requestedView=params.get("view");
  let chosenView=Object.hasOwn(viewCopy.tr,requestedView)&&requestedView!=="label"?requestedView:chosenDate==="all"?"all":"news";
  let explicitView=Object.hasOwn(viewCopy.tr,requestedView)&&requestedView!=="label";
  search.value = params.get("q") || "";
  const initial = JSON.parse($("edition-data").textContent);
  let editions = initial;
  let scan;
  const rawDays=new Map();
  let rawDates=[];
  let rawLoadSerial=0;
  const rawNote={
    tr:(total,dated,missing)=>total+" kaynak denendi. "+dated+" kaynak tarihli içerik verdi. "+missing+" kaynağa erişilemedi. Kaynak metinleri otomatik çevrilir. Çevirisi bulunmayan metin özgün dilinde gösterilir.",
    en:(total,dated,missing)=>total+" sources were attempted. "+dated+" exposed dated content and "+missing+" could not be reached. Source text is machine-translated. Untranslated entries display the original text."
  };
  let incomplete = false;
  let loading = location.protocol !== "file:";
  let headlines = [];
  let availableDates = [];
  const normalize = value => value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i");
  const canonicalTitle = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu," ").trim();
  const label = id => labels[id]?.[language === "tr" ? 0 : 1] || id;
  const dateFormat = day => new Intl.DateTimeFormat(language === "tr" ? "tr-TR" : "en-GB",{
    day:"numeric",month:"short",year:"numeric",timeZone:"UTC"
  }).format(new Date(day+"T00:00:00Z"));
  const catchupCopy = {
    tr:{heading:"Dünden eklenenler",published:"Yayın tarihi"},
    en:{heading:"Added from yesterday",published:"Published"},
  };
  const selectedDay = () => chosenDate === "latest" ? availableDates[0] : chosenDate;
  function previousDay(day) {
    if(!/^\d{4}-\d{2}-\d{2}$/.test(day||""))return undefined;
    const date=new Date(day+"T00:00:00Z");
    if(!Number.isFinite(date.valueOf()))return undefined;
    date.setUTCDate(date.getUTCDate()-1);
    return date.toISOString().slice(0,10);
  }
  const el = (tag,text,className) => {
    const node=document.createElement(tag);
    if(text)node.textContent=text;
    if(className)node.className=className;
    return node;
  };
  function validLink(value) {
    try {
      const url=new URL(value);
      return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : "";
    } catch {return "";}
  }
  function linkKey(href) {
    const url=new URL(href);
    const host=url.hostname.toLowerCase().replace(/^www\./,"");
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(trk|ref|fbclid|gclid|amp)$/i.test(key)) url.searchParams.delete(key);
    return host+url.pathname.replace(/\/$/,"")+url.search;
  }
  function contentType(row) {
    for(const link of row.links){
      const url=new URL(link.url);
      if(/(?:^|\.)(?:arxiv\.org|biorxiv\.org|medrxiv\.org|openreview\.net|ssrn\.com|doi\.org|papers\.ssrn\.com)$/i.test(url.hostname))return "research";
      if(/(?:^|\.)(?:nature\.com|science\.org|acm\.org|ieee\.org)$/i.test(url.hostname)&&
          /^\/(?:articles?\/|doi\/|document\/)/i.test(url.pathname))return "research";
    }
    for(const link of row.links){
      const url=new URL(link.url);
      if(/(?:^|\.)github\.com$/i.test(url.hostname)&&/\/releases\/(?:tag|download)\//i.test(url.pathname))return "releases";
      if(/(?:^|\.)(?:pypi\.org|npmjs\.com|crates\.io)$/i.test(url.hostname))return "releases";
    }
    const title=row.titles.join(" ");
    if(/\b(?:v?\d+\.\d+(?:\.\d+)?|release candidate|release notes)\b/i.test(title)&&
        /\b(?:released|release candidate|now available|patch release|version|sürüm\w*|yayımlandı|çıktı)\b/i.test(title))return "releases";
    return "news";
  }
  function rebuild() {
    const rows=[];
    const byUrl=new Map();
    const byTitle=new Map();
    const seenIds=new Set();
    function attach(row,links) {
      for (const source of links) {
        const url=validLink(source.url);
        if(!url)continue;
        const key=linkKey(url);
        if(!row.links.some(link=>link.key===key))row.links.push({...source,url,key});
        byUrl.set(key,row);
      }
    }
    function put(date,titles,cats,links,summaries=[],sourceSummary="",localized={}) {
      const titlesKey=[...new Set(titles.filter(Boolean).map(canonicalTitle))].map(value=>
        date+" "+(value.split(" ").length<5?(links[0]?.name || "")+" ":"")+value
      );
      const keys=links.map(source=>validLink(source.url)).filter(Boolean).map(linkKey);
      if(!keys.length)return;
      const previous=keys.map(key=>byUrl.get(key)).find(Boolean) || titlesKey.map(key=>byTitle.get(key)).find(Boolean);
      if(previous) {
        attach(previous,links);
        cats.forEach(cat=>previous.categories.add(cat));
        if(!previous.sourceSummary&&sourceSummary)previous.sourceSummary=sourceSummary;
        for(const lang of ["tr","en"])if(localized[lang]){
          const earlier=previous.localized[lang]||{};
          previous.localized[lang]={...localized[lang],...earlier};
        }
        return;
      }
      const row={date,titles,summaries,sourceSummary,localized:{...localized},categories:new Set(cats),links:[]};
      rows.push(row);
      attach(row,links);
      titlesKey.forEach(key=>byTitle.set(key,row));
    }
    for(const edition of editions){
      for(const story of edition.stories){
        if(seenIds.has(story.id))continue;
        seenIds.add(story.id);
        put(story.date || edition.date,[story.tr?.title,story.en?.title],story.categories,story.sources,
          [story.tr?.summary,story.en?.summary]);
      }
    }
    for(const [day,title,url,source,summary,localized] of [...(scan?.items||[]),...[...rawDays.values()].flatMap(day=>day.items)]){
      const tags=Object.keys(signals).filter(tag=>signals[tag].test(title+" "+source));
      put(day,[title,title],tags,[{url,name:source}],[],summary,localized);
    }
    for(const row of rows) {
      if(!row.categories.size)row.categories.add("other");
      row.type=contentType(row);
      row.index=normalize([...row.titles,...row.summaries,row.sourceSummary,...Object.values(row.localized).flatMap(entry=>[entry.title,entry.summary]),...row.links.flatMap(source=>[source.name,source.url]),...Array.from(row.categories).flatMap(cat=>labels[cat] || [cat])].join(" "));
    }
    headlines=rows.sort((a,b)=>b.date.localeCompare(a.date));
    availableDates=[...new Set([...headlines.map(row=>row.date),...editions.map(edition=>edition.date),...rawDates])].sort().reverse();
  }
  function makeLink(text,url,className) {
    const link=el("a",text,className);
    link.href=url;
    link.target="_blank";
    link.rel="noopener noreferrer";
    return link;
  }
  function createRow(row, catchup=false) {
    const article=el("article",null,"headline");
    const time=el("time",dateFormat(row.date));
    time.dateTime=row.date;
    if(catchup)time.prepend(el("span",catchupCopy[language].published));
    const body=el("div",null,"headline-main");
    const languageIndex=language==="tr"?0:1;
    const translated=row.localized[language];
    const title=(row.summaries.length?row.titles[languageIndex]:translated?.title) || row.titles[languageIndex] || row.titles[0] || row.titles[1];
    body.append(makeLink(title,row.links[0].url,"headline-title"));
    const summary=row.summaries[languageIndex] || row.summaries[0] || row.summaries[1];
    const description=summary || translated?.summary || row.sourceSummary;
    if(description){
      const paragraph=el("p",description,"headline-summary");
      if(!summary)paragraph.title=translated?.summary&&translated.summary!==row.sourceSummary?copyLabels[language].translation:copyLabels[language].source;
      body.append(paragraph);
    }else body.append(el("p",copyLabels[language].missing,"headline-summary headline-summary-missing"));
    const meta=el("p",null,"headline-meta");
    row.links.forEach((link,index)=>{
      if(index)meta.append(" · ");
      meta.append(makeLink(link.name,link.url));
    });
    body.append(meta);
    article.append(time,body);
    return article;
  }
  function chrome() {
    const words=copy[language];
    document.documentElement.lang=language;
    document.title=words.brand;
    document.querySelectorAll("[data-copy]").forEach(node=>{node.textContent=words[node.dataset.copy];});
    document.querySelector(".top-links").setAttribute("aria-label",words.nav);
    document.querySelector(".languages").setAttribute("aria-label",words.language);
    filters.setAttribute("aria-label",words.categories);
    views.setAttribute("aria-label",viewCopy[language].label);
    views.replaceChildren(...["news","research","releases","all"].map(key=>{
      const button=el("button",viewCopy[language][key]);
      button.type="button";
      button.dataset.view=key;
      button.setAttribute("aria-controls","stories");
      button.append(el("span","","view-count"));
      button.addEventListener("click",()=>{chosenView=key;explicitView=true;render();});
      return button;
    }));
    search.placeholder=words.search;
    document.querySelectorAll("[data-lang]").forEach(button=>{
      button.setAttribute("aria-pressed",String(button.dataset.lang===language));
      button.setAttribute("aria-label",button.dataset.lang==="tr"?"Türkçe":"English");
    });
    select.replaceChildren(new Option(words.allDates,"all"),...availableDates.map(day=>new Option(dateFormat(day),day)));
    const day=selectedDay();
    select.value=availableDates.includes(day)?day:"all";
    $("edition-label").textContent=chosenDate==="all"?words.allDates:day?dateFormat(day):"";
    const live=rawDays.get(day);
    const historical=scan&&(chosenDate==="all"||scan.dates?.includes(day));
    $("coverage").hidden=!live&&!historical&&!incomplete;
    $("coverage-message").textContent=[
      live?rawNote[language](live.total,live.dated,live.unreachable):historical?words.coverageText(scan.total,scan.dated,scan.unreachable):"",
      incomplete?words.failed:""
    ].filter(Boolean).join(" ");
    const tags = new Set(headlines.flatMap(row=>[...row.categories]));
    filters.replaceChildren(...Object.keys(labels).filter(key=>key==="all"||tags.has(key)).map(key=>{
      const button=el("button",label(key));
      button.type="button";
      button.dataset.category=key;
      button.addEventListener("click",()=>{category=key;render();});
      return button;
    }));
  }
  function render() {
    const words=copy[language];
    const day=selectedDay();
    const yesterday=previousDay(day);
    const lateKeys=new Set((rawDays.get(yesterday)?.lateUrls||[]).map(linkKey));
    const isCatchup=row=>row.date===yesterday&&row.links.some(link=>lateKeys.has(link.key));
    const dateRows=headlines.filter(row=>day==="all" || row.date===day || isCatchup(row));
    const terms=normalize(search.value.trim()).split(/\s+/).filter(Boolean);
    const activeView=!explicitView&&terms.length?"all":chosenView;
    const viewRows=activeView==="all"?dateRows:dateRows.filter(row=>row.type===activeView);
    const matches=viewRows.filter(row=>(category==="all"||row.categories.has(category)) && terms.every(term=>row.index.includes(term)));
    $("news-title").textContent=viewCopy[language][activeView];
    const counts={news:0,research:0,releases:0,all:dateRows.length};
    for(const row of dateRows)counts[row.type]++;
    for(const button of views.querySelectorAll("[data-view]")){
      const key=button.dataset.view;
      button.setAttribute("aria-pressed",String(key===activeView));
      button.querySelector(".view-count").textContent=loading?"":counts[key].toLocaleString(language);
    }
    const fragment=document.createDocumentFragment();
    const lateFragment=document.createDocumentFragment();
    for(const row of matches){
      const late=isCatchup(row);
      (late?lateFragment:fragment).append(createRow(row,late));
    }
    $("catchup-title").textContent=catchupCopy[language].heading;
    $("catchup").hidden=!lateFragment.childElementCount;
    $("catchup-stories").replaceChildren(lateFragment);
    container.replaceChildren(fragment);
    $("empty").hidden=loading||matches.length>0;
    $("count").textContent=loading?words.loading:words.count(matches.length,viewRows.length);
    document.querySelectorAll("[data-category]").forEach(button=>button.setAttribute("aria-pressed",String(button.dataset.category===category)));
    const url=new URL(location.href);
    for(const [key,value] of Object.entries({lang:language,date:chosenDate==="latest"?"":chosenDate,view:explicitView?chosenView:"",category:category==="all"?"":category,q:search.value.trim()})){
      if(value)url.searchParams.set(key,value);else url.searchParams.delete(key);
    }
    try {history.replaceState(null,"",url);}catch {}
  }
  document.querySelectorAll("[data-lang]").forEach(button=>button.addEventListener("click",()=>{
    language=button.dataset.lang;
    try {localStorage.setItem("technology-brief-language",language);}catch {}
    chrome();render();
  }));
  select.addEventListener("change",()=>{chosenDate=select.value;chrome();render();void loadChosenDay();});
  search.addEventListener("input",render);
  $("search-form").addEventListener("submit",event=>{event.preventDefault();render();});
  $("reset").addEventListener("click",()=>{category="all";search.value="";render();search.focus();});
  $("home").addEventListener("click",()=>{category="all";chosenDate="latest";chosenView="news";explicitView=false;search.value="";chrome();render();void loadChosenDay();});
  rebuild();
  chrome();
  render();
  async function readJson(path) {
    const response=await fetch(path);
    if(!response.ok)throw new Error("Archive service unavailable");
    return response.json();
  }
  async function readEditions() {
    const all = new Map(initial.map(edition=>[edition.date,edition]));
    let cursor="";
    do {
      const page=await readJson("/api/editions"+(cursor?"?cursor="+encodeURIComponent(cursor):""));
      if(!Array.isArray(page.editions))throw new Error("Invalid edition response");
      for(const edition of page.editions)all.set(edition.date,edition);
      if(!page.cursor||page.cursor===cursor)break;
      cursor=page.cursor;
    }while(cursor);
    return [...all.values()].sort((a,b)=>b.date.localeCompare(a.date));
  }
  async function loadChosenDay() {
    const run=++rawLoadSerial;
    const day=selectedDay();
    const dates=day==="all"?rawDates:[day,previousDay(day)];
    const pending=dates.filter(day=>rawDates.includes(day)&&!rawDays.has(day));
    if(!pending.length){
      if(loading){loading=false;rebuild();chrome();render();}
      return;
    }
    loading=true;
    render();
    for(let index=0;index<pending.length&&run===rawLoadSerial;index+=6){
      const results=await Promise.allSettled(pending.slice(index,index+6).map(day=>readJson("/api/source-days?date="+encodeURIComponent(day))));
      results.forEach(result=>{
        if(result.status==="rejected"){incomplete=true;return;}
        for(const day of result.value.days||[])rawDays.set(day.date,day);
      });
    }
    if(run!==rawLoadSerial)return;
    loading=false;
    rebuild();chrome();render();
  }
  if(loading) Promise.allSettled([readJson("/archive-source-results.json"),readEditions(),readJson("/api/source-days?dates=1")]).then(([scanResult,editionResult,datesResult])=>{
    if(scanResult.status==="fulfilled"&&Array.isArray(scanResult.value.items)) scan=scanResult.value;
    if(editionResult.status==="fulfilled") editions=editionResult.value;
    if(datesResult.status==="fulfilled"&&Array.isArray(datesResult.value.dates))rawDates=datesResult.value.dates;
    incomplete=!scan||editionResult.status==="rejected"||datesResult.status==="rejected";
    loading=false;
    rebuild();
    chrome();
    render();
    void loadChosenDay();
  });
})();
