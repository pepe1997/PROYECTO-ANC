const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('C:/Users/Josej/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage();
 const root=path.join(__dirname,'../modules/dashboard-bi');
 await page.setContent('<div id="modulo"></div><section id="visorReporte" hidden><div id="visorReporteContenido" class="report-viewer-content"></div></section>');
 await page.addStyleTag({path:path.join(root,'css/app.css')});
 await page.addStyleTag({path:path.join(root,'css/picking-report.css')});
 await page.addScriptTag({path:path.join(root,'js/picking-users.js')});
 await page.addScriptTag({path:path.join(root,'js/app.js')});
 await page.evaluate(()=>{
  window.dataUsuarios=[];
  modeloPicking=()=>Array.from({length:24},(_,hora)=>({hora,turno:hora<7?'NOCHE':hora<16?'DIA':'TARDE',bultos:500+(hora%4)*350,usuario:'U'+hora%5,lpn:'L'+hora}));
  verPickingCompacto();
 });
 assert.equal(await page.locator('#modulo .visual-kpi').count(),3);
 assert.equal(await page.locator('.picking-shift-card').count(),3);
 assert(!(await page.locator('#modulo').innerText()).includes('TOP 10'));
 assert(!(await page.locator('.picking-trend path').getAttribute('d')).includes('C'));
 await page.getByRole('button',{name:'Diaria',exact:true}).click();
 assert.equal(await page.locator('.picking-shift-card').count(),0);
 await page.getByRole('button',{name:'General',exact:true}).click();
 await page.locator('.picking-shift-card').filter({hasText:'TARDE'}).click();
 assert((await page.locator('.picking-trend h3').innerText()).includes('TARDE'));
 await page.locator('.picking-shift-card').filter({hasText:'TARDE'}).click();
 assert.equal(await page.locator('.picking-point-value').count(),24);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  console.log(width,await page.evaluate(()=>[...document.querySelectorAll('#modulo *')].filter(e=>e.getBoundingClientRect().right>innerWidth&&!e.closest('.picking-trend-scroll')).map(e=>[e.className,e.getBoundingClientRect().width]).slice(0,12)));
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
  assert(await page.locator('.picking-trend svg').evaluate(svg=>[...svg.querySelectorAll('text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.x+b.width<=svg.viewBox.baseVal.width&&b.y>=0&&b.y+b.height<=300})),'clipped chart labels');
  await page.screenshot({path:path.join(__dirname,'picking-'+width+'.png'),fullPage:true});
 }
 await page.evaluate(()=>abrirVistaReporte());
 await page.locator('#visorReporteContenido').getByRole('button',{name:'Diaria',exact:true}).click();
 assert.equal(await page.locator('#visorReporteContenido .picking-shift-card').count(),0);
 await page.evaluate(()=>cerrarVistaReporte());
 await page.locator('#picking-users-filter summary').click();
 await page.locator('[data-action="none"]').click();
 await page.locator('.picking-users-list input[value="U1"]').check();
 await page.locator('[data-action="apply"]').click();
 assert.equal(await page.locator('#modulo .visual-kpi').nth(1).locator('strong').innerText(),'1');
 const expected=await page.evaluate(()=>fmt(modeloPicking().filter(r=>r.usuario==='U1').reduce((s,r)=>s+r.bultos,0)));
 assert.equal(await page.locator('#modulo .visual-kpi').first().locator('strong').innerText(),expected);
 await page.evaluate(()=>abrirVistaReporte());
 assert.equal(await page.locator('#visorReporteContenido #picking-users-filter').count(),0);
 assert.equal(await page.locator('#visorReporteContenido .visual-kpi').first().locator('strong').innerText(),expected);
 console.log('PASS: KPIs, straight trend, 24 labels, daily/general, shift selection, report viewer, desktop/mobile bounds.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
