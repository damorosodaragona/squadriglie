export function validBoard(s){
 if(!s||s.version!==2||!Array.isArray(s.people)||!Array.isArray(s.options)||!s.options.length||s.options.length>100)return false;
 if(!s.people.every((p)=>p&&typeof p.id==='string'&&typeof p.name==='string'&&p.name.trim()&&['','M','F'].includes(p.sex)&&typeof p.strength==='string'&&typeof p.weakness==='string'&&(!p.age||Number.isFinite(Number(p.age)))))return false;
 const ids=s.people.map((p)=>p.id);if(new Set(ids).size!==ids.length)return false;
 if(new Set(s.options.map((o)=>o.id)).size!==s.options.length||!s.options.some((o)=>o.id===s.activeId))return false;
 return s.options.every((o)=>o&&typeof o.id==='string'&&typeof o.name==='string'&&o.name.trim()&&Array.isArray(o.groups)&&o.groups.length>=1&&o.groups.every((g)=>typeof g==='string'&&g.trim())&&o.assignments&&Array.isArray(o.order)&&o.order.length===ids.length&&new Set(o.order).size===ids.length&&o.order.every((id)=>ids.includes(id))&&ids.every((id)=>Number.isInteger(o.assignments[id])&&o.assignments[id]>=0&&o.assignments[id]<o.groups.length)&&o.groups.every((_,g)=>{if(g===0)return true;const ps=s.people.filter((p)=>o.assignments[p.id]===g);return ps.every((p)=>p.sex&&p.sex===ps[0].sex)}));
}
