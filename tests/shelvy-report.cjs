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
  window.dataTareas=Array.from({length:12},(_,i)=>({'Nro Tarea':'T'+i,Estado:i<8?'TERMINADO':'LISTO','Fe Y Hr Modif':'2026-10-01T10:00:00'}));
  window.dataAsignacion=Array.from({length:36},(_,i)=>({'Nro Tarea':'T'+i%12,Estado:i<32?'TERMINADO':'ASIGNADO','Un Asig':100+i,'Usua Pick':'USER'+i%4,'Fe Y Hr Modif':'2026-10-01T'+String(7+i%9).padStart(2,'0')+':00:00'}));
  verPickActivo();
 });
 const summary=await page.evaluate(()=>({tareas:fmt(resumenPickActivo().totalTareas),unidades:fmt(resumenPickActivo().totalTerminadas)}));
 assert.equal(await page.locator('.visual-kpi').count(),2);
 assert.equal(await page.locator('.visual-kpi').first().locator('strong').innerText(),summary.tareas);
 assert.equal(await page.locator('.visual-kpi').nth(1).locator('strong').innerText(),summary.unidades);
 assert.equal(await page.locator('.case-summary>article').count(),3);
 assert.equal(await page.locator('.shelvy-trends>article').count(),2);
 assert.equal(await page.locator('.case-picker-grid>article').count(),4);
 assert.equal(await page.locator('.visual-header h2').innerText(),'REPORTE SHELVY');
 assert(await page.locator('.case-trend-path').evaluateAll(paths=>paths.every(p=>!p.getAttribute('d').includes('C'))));
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:1200});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow');
  assert(await page.locator('.case-trend-scroll svg').evaluateAll(svgs=>svgs.every(s=>[...s.querySelectorAll('text')].every(t=>{const b=t.getBBox();return b.x>=0&&b.x+b.width<=s.viewBox.baseVal.width&&b.y>=0&&b.y+b.height<=s.viewBox.baseVal.height}))));
  await page.screenshot({path:path.join(__dirname,'shelvy-'+width+'.png'),fullPage:true});
 }
 await page.evaluate(()=>{dataAsignacion.push({'Nro Tarea':'T0',Estado:'TERMINADO','Un Asig':10,'Usua Pick':'USER4','Fe Y Hr Modif':'2026-10-01T10:00:00'});renderPickActivo();});
 await page.getByRole('button',{name:'Siguiente',exact:true}).click();
 assert.equal(await page.locator('.case-picker-grid>article').count(),1);
 await page.evaluate(()=>abrirVistaReporte());
 assert.equal(await page.locator('#visorReporteContenido .visual-header h2').innerText(),'REPORTE SHELVY');
 console.log('PASS: existing summary totals, two KPIs, three gauges, straight tasks/units/user charts, pagination and responsive bounds.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
