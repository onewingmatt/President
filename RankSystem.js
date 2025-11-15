const RANKS=['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
export class RankSystem{
static rankValue(c,o){
if(c.rank==='3'&&(c.suit==='H'||c.suit==='D'))return -100;
if(c.rank==='J'&&c.suit==='D')return 300;
if(c.rank==='3'&&(c.suit==='C'||c.suit==='S'))return 200;
if(c.rank==='2')return 150;
return RANKS.indexOf(c.rank);
}
static compareCards(a,b,o){
return this.rankValue(a,o)-this.rankValue(b,o);
}
static sortCards(c,o){
return[...c].sort((a,b)=>this.compareCards(a,b,o));
}
static isBlack3(c){
return c.rank==='3'&&(c.suit==='C'||c.suit==='S');
}
static isJackOfDiamonds(c){
return c.rank==='J'&&c.suit==='D';
}
static isTwo(c){
return c.rank==='2';
}
static countTwos(cards){
return cards.filter(c=>this.isTwo(c)).length;
}
static countJDs(cards){
return cards.filter(c=>this.isJackOfDiamonds(c)).length;
}
static countBlack3s(cards){
return cards.filter(c=>this.isBlack3(c)).length;
}
}