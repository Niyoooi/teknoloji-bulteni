const genericCopy = /^(?:read (?:more|the full story)|watch (?:now|the video)|subscribe|learn more|follow us|click here|continue reading|buy now|^https?:\/\/)/i;
const proceduralRisk = /(?:\b(?:payload|shellcode|exploit chain)\b.{0,50}\b(?:run|execute|inject|trigger|bypass|overwrite)\b|\b(?:run|execute|compile|inject|craft)\b.{0,35}\b(?:exploit|shellcode|malware|weapon|pathogen)\b)/i;
const newsVerbs = /\b(?:announc\w*|releas\w*|publish\w*|launch\w*|introduc\w*|finds?|found|adds?|added|reports?|reported|invest\w*|test\w*|rolls?|reveals?|disclos\w*|support\w*|study|çıkardı|açıkladı|duyurdu|yayımladı|buldu)\b/i;
const clean = value => value.normalize("NFKC").replace(/<[^>]*>/g," ")
  .replace(/(?:https?:\/\/|www\.)[^\s]+/gi,"").replace(/\s+/g," ").trim();
const normalized = value => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu," ").trim();
export function shortSourceSummary(value,title) {
  if(typeof value!=="string"||!value.trim())return "";
  const text=clean(value);
  if(!text||proceduralRisk.test(text))return "";
  const headline=normalized(title);
  const keywords=new Set(headline.split(" ").filter(word=>word.length>3));
  const sentences=text.match(/[^.!?。！？]+(?:[.!?。！？]+(?=\s|$)|$)/gu)||[text];
  const choices=sentences.map(clean).filter(sentence=>{
    const comparable=normalized(sentence);
    return comparable.length>=28 && comparable!==headline && !genericCopy.test(sentence);
  }).slice(0,5);
  if(!choices.length)return "";
  const score=sentence=>{
    const words=normalized(sentence).split(" ");
    return (newsVerbs.test(sentence)?3:0)+words.filter(word=>keywords.has(word)).length+Math.min(words.length,16)/16;
  };
  const chosen=choices.reduce((best,sentence)=>score(sentence)>score(best)?sentence:best);
  const words=chosen.split(/\s+/);
  const limit=22;
  if(words.length>limit)return words.slice(0,limit).join(" ").replace(/[,;:\-–]$/,"")+"…";
  if(chosen.length>235)return chosen.slice(0,232).trimEnd()+"…";
  return chosen;
}
