import{RankSystem}from'./RankSystem.js';
export class Validator{
static getPlayType(c,o){
if(!c||c.length===0)return{type:'invalid',error:'No cards'};
const s=RankSystem.sortCards(c,o);
if(c.length===1)return{type:'single',cards:s,rank:RankSystem.rankValue(s[0],o),length:1,hasJD:RankSystem.isJackOfDiamonds(s[0]),hasTwo:RankSystem.isTwo(s[0]),hasBlack3:RankSystem.isBlack3(s[0])};
const r=[...new Set(c.map(x=>x.rank))];
const jdCount=RankSystem.countJDs(c);
if(r.length===1||jdCount>0){
const numTwos=RankSystem.countTwos(c);
const numBlack3s=RankSystem.countBlack3s(c);
return{type:'set',cards:s,rank:RankSystem.rankValue(s[0],o),length:c.length,hasJD:jdCount>0,numTwos:numTwos,numBlack3s:numBlack3s};
}
return{type:'invalid',error:'Invalid play'};
}
static canBeatPlay(n,l,o){
if(!l||l.type==='none')return{canBeat:true};
if(n.type==='invalid')return{canBeat:false};
if(n.hasJD&&n.type==='single')return{canBeat:true};
if(n.hasJD&&n.type==='set'&&n.length===l.length)return{canBeat:true};
if(n.type==='single'&&n.hasTwo)return{canBeat:true};
if(n.type==='set'&&n.numTwos===1&&(l.type==='single'||l.length<=2))return{canBeat:true};
if(n.type==='set'&&n.numTwos===2&&l.length<=3)return{canBeat:true};
if(n.type==='set'&&n.numTwos===3&&l.length<=4)return{canBeat:true};
if(n.type==='set'&&n.numBlack3s>0&&l.length<=4)return{canBeat:true};
if(n.type!==l.type||n.length!==l.length)return{canBeat:false};
return n.rank>l.rank?{canBeat:true}:{canBeat:false};
}
}