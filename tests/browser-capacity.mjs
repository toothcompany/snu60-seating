import assert from 'node:assert/strict';

// Use the existing independent signed-in editor, signed-out viewer and
// real application save/undo workflow. No production connection or credentials.
export async function checkCapacity({page,viewer,read,committed}){
  const initial=await read(page),t=initial.tables.find(t=>initial.attendees.filter(a=>a.tableId===t.id).length===t.capacity&&t.capacity>=2&&t.capacity<=27);
  assert.ok(t);const start=t.capacity,baseRev=initial.rev;
  const disc=pg=>pg.locator(`#tables [data-table-handle="${t.id}"]`);
  const vacancy=pg=>pg.locator(`#tables .tableGroup[data-tid="${t.id}"] .vacant`);
  const expectCount=async(pg,x)=>{await pg.waitForFunction(({id,cap})=>document.querySelector('[data-table-handle="'+id+'"]')?.getAttribute('aria-label')?.endsWith('정원 '+cap+'명'),{id:t.id,cap:x});};
  const dialog=page.locator('#editor');
  assert.ok(await viewer.locator('#capacityTool').isHidden()||await viewer.locator('#capacityTool').isDisabled());
  await disc(viewer).click();assert.ok(await viewer.locator('#capacityInput').isDisabled());await viewer.locator('#cancel').click();
  await page.locator('#capacityTool').click();await dialog.getByLabel('조정할 테이블').selectOption(t.id);
  await dialog.getByRole('button',{name:'정원 1석 늘리기'}).click();
  await dialog.getByRole('button',{name:'정원 1석 늘리기'}).click();
  assert.match(await dialog.locator('#capacityProjection').innerText(),/빈자리 2석/);
  await dialog.getByRole('button',{name:'정원 저장'}).click();await committed(page,baseRev+1);await expectCount(viewer,start+2);
  assert.equal(await vacancy(viewer).count(),2);assert.match(await disc(viewer).getAttribute('class'),/under/);
  assert.deepEqual((await read(page)).attendees,initial.attendees);
  await page.reload({waitUntil:'networkidle'});await committed(page,baseRev+1);
  await disc(page).click();await dialog.locator('#capacityInput').fill(String(start-1));
  assert.match(await dialog.locator('#capacityProjection').innerText(),/1명 초과/);
  await dialog.locator('#save').click();await committed(page,baseRev+2);await expectCount(viewer,start-1);
  assert.match(await disc(viewer).getAttribute('class'),/over/);
  assert.equal(await vacancy(viewer).count(),0);assert.deepEqual((await read(page)).attendees,initial.attendees);
  await page.locator('#undo').click();await committed(page,baseRev+3);await expectCount(viewer,start+2);
  await page.locator('#undo').click();await committed(page,baseRev+4);await expectCount(viewer,start);
  assert.deepEqual((await read(page)).tables,initial.tables);
  console.log('PASS: authorized capacity increase and decrease persisted and reached public viewer; two empty seats / over-capacity displayed, roster intact, both changes undoable.');
}
