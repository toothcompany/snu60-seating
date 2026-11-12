import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { checkSharedEditor } from './browser-edit.mjs';
const server=spawn('python3',['-m','http.server','4173','--bind','127.0.0.1'],{stdio:'ignore'});
let browser;
try {
 for(let i=0;i<60;i++){try{const r=await fetch('http://127.0.0.1:4173/');if(r.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 await mkdir('test-output',{recursive:true});
 browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Prove the public initial plan renders even with Firebase unreachable and no Google login.
 await page.route('https://www.gstatic.com/**',r=>r.abort());
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'networkidle'});
 await page.waitForSelector('.tableDisc');
 assert.equal(await page.locator('.tableGroup').count(),12);
 assert.equal(await page.locator('#tables .seat').count(),100);
 assert.equal(await page.locator('#people .personRow').count(),102);
 assert.equal(await page.locator('#rosterCount').innerText(),'102');
 assert.equal(await page.locator('.tableDisc.over').count(),0);assert.equal(await page.locator('.tableDisc.under').count(),2);
 assert.equal(await page.locator('#tables .vacant').count(),2);
 assert.equal(await page.locator('#login').count(),1);
 assert.equal(await page.locator('#add').isDisabled(),true);
 await page.locator('#search').fill('신명섭');
 assert.equal(await page.locator('#people .personRow').count(),1);
 assert.ok((await page.locator('#people').innerText()).includes('11번'));
 await page.locator('#search').fill('신혜선');assert.equal(await page.locator('#people .personRow').count(),1);
 await page.locator('#search').fill('');await page.locator('#filter').selectOption('none');
 assert.equal(await page.locator('#people .personRow').count(),2);const crew=await page.locator('#people').innerText();assert.ok(crew.includes('정연호')&&crew.includes('유부강')&&!crew.includes('신종학'));
 await page.locator('#filter').selectOption('all');
 await page.screenshot({path:'test-output/public-desktop.png',fullPage:true});
 const visible=['신명섭','신혜선','김문섭','이정후'];
 for(const name of visible)assert.ok((await page.locator('#people').innerText()).includes(name));
 assert.equal((await page.locator('#people').innerText()).includes('유한양행 2'),false);
 await page.setViewportSize({width:390,height:844});await page.reload({waitUntil:'networkidle'});await page.locator('#fit').click();
 assert.equal(await page.locator('.tableGroup').count(),12);assert.equal(await page.locator('#people .personRow').count(),102);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
 await page.screenshot({path:'test-output/public-mobile.png',fullPage:true});
 assert.deepEqual(errors,[]);
 // The editing page still requires login and starts with disabled edit controls.
 await page.goto('http://127.0.0.1:4173/editor.html',{waitUntil:'networkidle'});
 assert.equal(await page.locator('#login').count(),1);assert.equal(await page.locator('#seed').isDisabled(),true);assert.equal(await page.locator('#import').isDisabled(),true);
 console.log('PASS: anonymous viewer renders 12 tables, 100 occupied seats, 2 spare chairs, 102 roster entries, search, dinner-unassigned filter, desktop and mobile; editing remains locked without login.');
 await checkSharedEditor(browser);
} finally { if(browser)await browser.close();server.kill(); }
