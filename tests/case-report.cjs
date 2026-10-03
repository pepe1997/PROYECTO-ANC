const path=require('path'),assert=require('assert');
const {chromium}=require('C:/Users/Josej/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const root=path.join(__dirname,'../modules/dashboard-bi');
 await page.setContent('<div id="modulo"></div><section id="visorReporte" hidden><div id="visorReporteContenido" class="report-viewer-content"></div></section>');
 await page.addStyleTag({path:path.join(root,'css/app.css')});
 await page.addStyleTag({path:path.join(root,'css/case-report.css')});
 await page.addScriptTag({path:path.join(root,'js/app.js')});
 await page.evaluate(()=>{
  window.dataUsuarios=[];
  modeloCase=()=>Array.from({length:36},(_,i)=>({hora:7+i%9,usuario:'USER'+Math.floor(i/9),bultos:100+i%4*50,estado:'TERMINADO'})).concat([{usuario:'USER0',hora:16,bultos:50,estado:'ASIGNADO'},{usuario:'USER0',hora:16,bultos:75,estado:'CANCELADO'}]);
  verCase();
 });
 assert.equal(await page.locator('.visual-kpi').count(),4);
 assert.equal(await page.locator('.case-summary>article').count(),2);
 assert(!(await page.locator('.case-redesign').innerText()).includes('BULTOS TRABAJADOS'));
 assert(!(await page.locator('.case-trend-path').getAttribute('d')).includes('C'));
 const before=await page.locator('.visual-kpi-row').innerText();
 await page.getByRole('button',{name:'Usuarios',exact:true}).click();
 assert.equal(await page.locator('.case-picker-chart').count(),4);
 assert.equal(await page.locator('.visual-kpi-row').innerText(),before);
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1000});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
  assert(await page.locator('.case-trend-scroll svg').evaluateAll(svgs=>svgs.every(s=>[...s.querySelectorAll('text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.x+b.width<=s.viewBox.baseVal.width&&b.y>=0&&b.y+b.height<=s.viewBox.baseVal.height}))));
  await page.screenshot({path:path.join(__dirname,'case-users-'+width+'.png'),fullPage:true});
 }
 await page.evaluate(()=>{const orig=modeloCase;modeloCase=()=>orig().concat([{usuario:'USER4',hora:10,bultos:80,estado:'FINALIZADA'}]);renderCase()});
 await page.getByRole('button',{name:'Siguiente',exact:true}).click();
 assert.equal(await page.locator('.case-picker-chart').count(),1);
 await page.evaluate(()=>abrirVistaReporte());
 await page.locator('#visorReporteContenido').getByRole('button',{name:'General',exact:true}).click();
 assert.equal(await page.locator('#visorReporteContenido .case-summary>article').count(),2);
 await page.evaluate(()=>cerrarVistaReporte());
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:path.join(__dirname,'case-general.png'),fullPage:true});
 console.log('PASS: unchanged totals, four KPIs, two gauges, straight charts, four users, pagination, viewer and mobile/desktop bounds.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
