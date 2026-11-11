// The public hall has twelve places. A table ID follows its group; its printed
// number identifies its current place, not the original import/roster group.
import {normalize} from './core.mjs';

export function fixedHall(plan) { return plan.tables.length === 12; }

export function numberedLayout(input) {
  const plan = normalize(input);
  if (!fixedHall(plan)) return plan; // Keep custom imports with other table counts as drawn.
  const frontFirst = plan.tables.slice().sort((a,b)=>a.y-b.y || a.x-b.x || a.number-b.number);
  for (let row=0; row<4; row++) {
    const leftFirst = frontFirst.slice(row*3,row*3+3).sort((a,b)=>a.x-b.x || a.y-b.y || a.number-b.number);
    leftFirst.forEach((t,col)=>{
      t.number = row*3+col+1;
      t.x = 240+480*col;
      t.y = 300+430*row;
    });
  }
  return plan;
}

// Use the center of the dragged disc, not the pointer's grip point. Empty gaps
// cancel rather than silently swapping with a table on the far side of the room.
export function dropTableAt(plan,x,y) {
  const closest = plan.tables.map(t=>({t,d:Math.hypot(t.x-x,t.y-y)})).sort((a,b)=>a.d-b.d)[0];
  return closest?.d<=210 ? closest.t.id : null;
}
