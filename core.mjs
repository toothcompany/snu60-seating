// Pure seating model. No real names or affiliations belong in this repository.
export const WIDTH = 1440, HEIGHT = 1960;
export const copy = value => JSON.parse(JSON.stringify(value));
export function emptyState() {
  const cols = [0,2,1,0,1,2,0,1,2,0,1,2];
  return {version:1, rev:0, tables:Array.from({length:12},(_,i)=>({id:`t${i+1}`,number:i+1,capacity:i<9?8:9,x:240+cols[i]*480,y:300+Math.floor(i/3)*430+(cols[i]===1?60:0)})), attendees:[]};
}
export function demoState() {
  const s=emptyState(); let i=0;
  for(const t of s.tables) for(let j=0;j<t.capacity;j++) {
    i++; s.attendees.push({id:`demo-${i}`,name:`참석자 ${String(i).padStart(2,'0')}`,affiliation:'연습용 가상 명단',tableId:t.id,order:j});
  }
  return s;
}
export const membersAt = (s,id) => s.attendees.filter(a=>a.tableId===id).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
export function occupancy(s,t) {const n=membersAt(s,t.id).length;return {count:n,delta:n-t.capacity,kind:n>t.capacity?'over':n<t.capacity?'under':'full'};}
const cleanText=(v,max)=>String(v??'').trim().slice(0,max);
export function normalize(input) {
  if(!input||!Array.isArray(input.tables)||!Array.isArray(input.attendees)) throw Error('테이블과 참석자 목록이 있는 파일이 필요합니다.');
  if(input.tables.length<1||input.tables.length>40||input.attendees.length>500) throw Error('테이블 1~40개, 참석자 최대 500명까지 가능합니다.');
  const tableIds=new Set(), numbers=new Set(), ids=new Set();
  const tables=input.tables.map(t=>{
    const id=cleanText(t.id,80), number=Number(t.number),capacity=Number(t.capacity),x=Number(t.x),y=Number(t.y);
    if(!id||tableIds.has(id)||!Number.isInteger(number)||number<1||numbers.has(number)||!Number.isInteger(capacity)||capacity<1||capacity>30||!Number.isFinite(x)||!Number.isFinite(y)) throw Error('테이블 번호·정원·위치가 올바르지 않습니다.');
    tableIds.add(id);numbers.add(number);
    return {id,number,capacity,x:Math.max(210,Math.min(WIDTH-210,x)),y:Math.max(230,Math.min(HEIGHT-210,y))};
  });
  const attendees=input.attendees.map((a,i)=>{
    const id=cleanText(a.id,80),name=cleanText(a.name,80),tableId=a.tableId==null||a.tableId===''?null:String(a.tableId);
    if(!id||!name||ids.has(id)||(tableId!==null&&!tableIds.has(tableId))) throw Error('참석자 ID·성명 또는 배정 테이블을 확인해 주세요.');
    ids.add(id);
    return {id,name,affiliation:cleanText(a.affiliation,200),tableId,order:Number.isFinite(Number(a.order))?Number(a.order):i};
  });
  const s={version:1,rev:Number.isInteger(input.rev)&&input.rev>=0?input.rev:0,tables,attendees};
  for(const t of [...tables,{id:null}]) membersAt(s,t.id).forEach((a,i)=>a.order=i);
  return s;
}
export function personSignature(a) {return JSON.stringify([a?.tableId,a?.order,a?.name,a?.affiliation]);}
function person(s,id,expected) {
  const a=s.attendees.find(a=>a.id===id);
  if(!a) throw Error('참석자가 삭제되었습니다. 새 명단에서 다시 선택해 주세요.');
  if(expected&&personSignature(a)!==expected) throw Error('다른 운영진이 이 참석자를 먼저 변경했습니다. 새 배치에서 다시 시도해 주세요.');
  return a;
}
export function applyOperation(current,op) {
  const s=normalize(current);
  if(op.type==='replace') {
    if(s.rev!==op.expectedRev) throw Error('다른 운영진의 변경이 있습니다. 최신 배치를 확인한 후 다시 불러오세요.');
    const n=normalize(op.value);n.rev=s.rev;return n;
  }
  if(op.type==='move') {
    const a=person(s,op.id,op.expected);
    if(op.tableId!==null&&!s.tables.some(t=>t.id===op.tableId)) throw Error('대상 테이블이 없습니다.');
    a.tableId=op.tableId;a.order=membersAt(s,op.tableId).length;
  } else if(op.type==='swapPeople') {
    const a=person(s,op.id,op.expected),b=person(s,op.otherId,op.otherExpected);
    const [tid,order]=[a.tableId,a.order];a.tableId=b.tableId;a.order=b.order;b.tableId=tid;b.order=order;
  } else if(op.type==='editPerson') {
    const a=person(s,op.id,op.expected);
    a.name=op.name;a.affiliation=op.affiliation;
    if(a.tableId!==op.tableId) {a.tableId=op.tableId;a.order=membersAt(s,op.tableId).length;}
  } else if(op.type==='addPerson') {
    if(s.attendees.some(a=>a.id===op.person.id)) throw Error('이미 추가된 참석자입니다.');
    s.attendees.push({...op.person,order:membersAt(s,op.person.tableId).length});
  } else if(op.type==='removePerson') {
    person(s,op.id,op.expected);s.attendees=s.attendees.filter(a=>a.id!==op.id);
  } else if(op.type==='tablePosition'||op.type==='capacity'||op.type==='swapTables') {
    const t=s.tables.find(t=>t.id===op.id);if(!t) throw Error('대상 테이블이 없습니다.');
    if(op.type==='tablePosition') {
      if(t.x!==op.fromX||t.y!==op.fromY) throw Error('다른 운영진이 이 테이블을 먼저 이동했습니다. 다시 시도해 주세요.');
      t.x=op.x;t.y=op.y;
    } else if(op.type==='capacity') {
      if(t.capacity!==op.expectedCapacity) throw Error('정원이 이미 변경되었습니다. 다시 확인해 주세요.');
      t.capacity=Number(op.capacity);
    } else {
      const b=s.tables.find(t=>t.id===op.otherId);if(!b) throw Error('대상 테이블이 없습니다.');
      if(s.rev!==op.expectedRev) throw Error('다른 변경이 발생했습니다. 다시 위치 교환을 선택해 주세요.');
      [t.x,t.y,b.x,b.y]=[b.x,b.y,t.x,t.y];
    }
  } else throw Error('지원하지 않는 변경입니다.');
  return normalize(s);
}
export function rowsToState(rows,existing=emptyState()) {
  const norm=v=>String(v??'').replace(/\s/g,'').toLowerCase();
  const names=['성명·표기','성명','이름','참석자','이미지명단','name'];
  const header=rows.findIndex(row=>row.some(x=>names.includes(norm(x))));
  if(header<0) throw Error('성명·표기 또는 성명 열을 찾을 수 없습니다. 좌석별명단 시트를 사용해 주세요.');
  const h=rows[header].map(norm), pick=keys=>h.findIndex(x=>keys.includes(x));
  const ni=pick(names),ai=pick(['소속','소속·관계','affiliation']),ti=pick(['테이블','테이블번호','제안테이블','table']),si=pick(['좌석','좌석번호','seat']);
  const s=normalize(existing);s.attendees=[];const seats=new Set();
  for(const [i,row] of rows.slice(header+1).entries()) {
    const name=String(row[ni]??'').trim();if(!name) continue;
    const tableText=ti>=0?String(row[ti]??'').trim():'';
    const num=tableText===''?null:Number(tableText.replace(/번|테이블|\s/g,''));
    const t=num===null?null:s.tables.find(t=>t.number===num);
    if(num!==null&&!t) throw Error(`${i+header+2}행의 테이블 번호를 확인해 주세요.`);
    const seat=si>=0?Number(row[si]):0;
    if(t&&seat>0) {const k=`${t.id}-${seat}`;if(seats.has(k))throw Error(`${num}번 테이블 ${seat}번 좌석이 중복되어 있습니다.`);seats.add(k);}
    s.attendees.push({id:`import-${i+1}`,name,affiliation:ai>=0?String(row[ai]??'').trim():'확인 필요',tableId:t?.id??null,order:seat>0?seat:i+1000});
  }
  if(!s.attendees.length) throw Error('명단이 비어 있습니다.');
  return normalize(s);
}
export function parseCsv(text) {
  const out=[];let row=[],cell='',quoted=false;
  text=String(text).replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(c===','&&!quoted){row.push(cell);cell='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);out.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw Error('CSV 따옴표가 닫히지 않았습니다.');
  if(cell!==''||row.length){row.push(cell);out.push(row);}return out;
}
export function toCsv(s) {
  const esc=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const rows=[['테이블','좌석','성명','소속']];
  for(const t of [...s.tables.slice().sort((a,b)=>a.number-b.number),{id:null,number:''}]) membersAt(s,t.id).forEach((a,i)=>rows.push([t.number,t.id===null?'':i+1,a.name,a.affiliation]));
  return '\uFEFF'+rows.map(row=>row.map(esc).join(',')).join('\r\n');
}
