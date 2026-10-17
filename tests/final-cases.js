import { readFileSync } from 'node:fs';
import path from 'node:path';
import { defaultData } from '../src/store.js';
export function finalCases() {
  const text=readFileSync(path.resolve(defaultData,'../test-data/final-questions.md'),'utf8');
  const sections=text.split(/^## Q(\d+)\. /m);
  const cases=[];
  const users={1:['U-201'],2:['U-301'],3:['U-401'],4:['U-402'],5:['U-201'],6:['U-601'],7:['U-301','U-301'],8:['U-601','U-601','U-301','U-501','U-601'],9:Array(6).fill('U-301'),10:['U-201'],11:['U-501']};
  for(let i=1;i<sections.length;i+=2){const number=+sections[i],body=sections[i+1];const questions=[...body.matchAll(/\*"([\s\S]*?)"\*/g)].map(m=>m[1].replace(/\s+/g,' ').trim());
    questions.forEach((question,turn)=>{let chatId=`final-q${number}`;if(number===8)chatId=`final-q8-${turn<2?'nathan-first':turn===2?'robert':turn===3?'olivia':'nathan-second'}`;cases.push({number,turn:turn+1,userId:users[number][turn],chatId,question});});
  }
  return cases;
}
