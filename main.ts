import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';
import{join}from'node:path';
const IN=process.env.MAKEFUN_INPUT_DIR??'/input',OUT=process.env.MAKEFUN_OUTPUT_DIR??'/output',MAX=65536,enc=new TextEncoder();
type Answer={bytes:Uint8Array,code:number};
export function execute(p:Uint8Array,input:Uint8Array):Answer{
const n=p.length,D=new Int32Array(256),C=new Int32Array(64),M=new Int32Array(256),O=new Uint8Array(MAX);
let sp=0,csp=0,olen=0,ip=0,pc=0,steps=0;
const end=(c:number):Answer=>({bytes:O.slice(0,olen),code:c});
const S:Record<number,[number,number,number]>={0:[0,0,0],1:[1,0,1],2:[4,0,1],3:[0,1,0],4:[0,1,2],5:[0,2,2],6:[0,2,3],7:[0,3,3],16:[0,2,1],17:[0,2,1],18:[0,2,1],19:[0,2,1],20:[0,2,1],21:[0,2,1],22:[0,2,1],23:[0,1,1],24:[0,2,1],25:[0,2,1],26:[0,2,1],27:[0,1,1],28:[0,2,1],29:[0,2,1],30:[0,2,1],32:[0,2,1],33:[0,2,1],34:[0,2,1],48:[2,0,0],49:[2,1,0],50:[2,1,0],51:[2,0,0],52:[0,0,0],64:[0,1,1],65:[0,2,0],80:[0,1,0],81:[0,1,0],82:[0,0,1],83:[0,1,0]};
for(;;){
if(steps===1000000)return end(10);
if(pc<0||pc>=n)return end(9);
const op=p[pc],info=S[op];
if(!info)return end(5);
const[imm,pops,pushes]=info;
if(pc+imm>=n)return end(9);
steps++;
const nx=pc+1+imm;
if(sp<pops)return end(2);
if(sp-pops+pushes>256)return end(3);
pc=nx;
switch(op){
case 0:return end(0);
case 1:D[sp++]=(p[nx-1]<<24)>>24;break;
case 2:D[sp++]=p[nx-4]|(p[nx-3]<<8)|(p[nx-2]<<16)|(p[nx-1]<<24);break;
case 3:sp--;break;
case 4:D[sp]=D[sp-1];sp++;break;
case 5:{const t=D[sp-1];D[sp-1]=D[sp-2];D[sp-2]=t;break}
case 6:D[sp]=D[sp-2];sp++;break;
case 7:{const t=D[sp-3];D[sp-3]=D[sp-2];D[sp-2]=D[sp-1];D[sp-1]=t;break}
case 23:D[sp-1]=-D[sp-1]|0;break;
case 27:D[sp-1]=~D[sp-1];break;
case 16:case 17:case 18:case 19:case 20:case 21:case 22:case 24:case 25:case 26:case 28:case 29:case 30:case 32:case 33:case 34:{
const b=D[sp-1],a=D[sp-2];let r=0;
if(op===16)r=(a+b)|0;
else if(op===17)r=(a-b)|0;
else if(op===18)r=Math.imul(a,b);
else if(op===19){if(!b)return end(4);r=a===-2147483648&&b===-1?a:(a/b)|0}
else if(op===20){if(!b)return end(4);r=b===-1?0:(a%b)|0}
else if(op===21){if(!b)return end(4);r=Math.floor((a>>>0)/(b>>>0))|0}
else if(op===22){if(!b)return end(4);r=((a>>>0)%(b>>>0))|0}
else if(op===24)r=a&b;
else if(op===25)r=a|b;
else if(op===26)r=a^b;
else if(op===28)r=a<<(b&31);
else if(op===29)r=a>>(b&31);
else if(op===30)r=(a>>>(b&31))|0;
else if(op===32)r=a===b?1:0;
else if(op===33)r=a<b?1:0;
else r=(a>>>0)<(b>>>0)?1:0;
sp-=2;D[sp++]=r;break}
case 48:case 49:case 50:{
const off=((p[nx-2]|(p[nx-1]<<8))<<16)>>16;
let take=op===48;
if(op!==48){const v=D[--sp];take=op===49?v===0:v!==0}
if(take)pc=nx+off;
break}
case 51:if(csp===64)return end(7);C[csp++]=nx;pc=p[nx-2]|(p[nx-1]<<8);break;
case 52:if(csp===0)return end(8);pc=C[--csp];break;
case 64:{const a=D[sp-1];if(a<0||a>255)return end(6);D[sp-1]=M[a];break}
case 65:{const a=D[sp-1];if(a<0||a>255)return end(6);M[a]=D[sp-2];sp-=2;break}
case 80:{const t=enc.encode(String(D[sp-1]));if(olen+t.length>MAX)return end(11);O.set(t,olen);olen+=t.length;sp--;break}
case 81:if(olen===MAX)return end(11);O[olen++]=D[--sp]&255;break;
case 82:D[sp++]=ip<input.length?input[ip++]:-1;break;
case 83:return end(D[--sp]&255);
}}
}
for(const id of readdirSync(IN).sort()){
const a=execute(new Uint8Array(readFileSync(join(IN,id,'program.bin'))),new Uint8Array(readFileSync(join(IN,id,'input.bin'))));
mkdirSync(join(OUT,id),{recursive:true});
writeFileSync(join(OUT,id,'stdout.bin'),a.bytes);
writeFileSync(join(OUT,id,'exit.txt'),`${a.code}\n`);
}
