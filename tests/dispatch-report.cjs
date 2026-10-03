const path=require('path'),assert=require('assert');
const {chromium}=require('C:/Users/Josej/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),root=path.join(__dirname,'../modules/dashboard-bi');
 await page.setContent('<div id="modulo"></div><section id="visorReporte" hidden><div id="visorReporteContenido" class="report-viewer-content"></div></section>');
 for(const css of ['app','case-report','dispatch-report'])await page.addStyleTag({path:path.join(root,'css/'+css+'.css')});
 await page.addScriptTag({path:path.join(root,'js/app.js')});
 await page.evaluate(()=>{
 modeloDespacho=()=>[];filtrarDespachoPorTurno=d=>d;
 resumenDespacho=()=>({viajes:12,palletsTotal:80,tiendas:20,costoTotal:2000,bultosPallet:45,placas:10,paradas:20,porTurno:{DIA:{costo:1200,viajes:8,pallets:50,bultosPallet:40,placas:6},NOCHE:{costo:800,viajes:4,pallets:30,bultosPallet:50,placas:4}}});
 viajesDespachoPorHora=()=>[{label:'07:00',valor:2},{label:'08:00',valor:6},{label:'09:00',valor:4}];
 verDespachoCompacto();
 });
 assert.equal(await page.locator('.visual-kpi').count(),5);
 assert.equal(await page.locator('.dispatch-shift-visual').count(),2);
 assert(!(await page.locator('#modulo').innerText()).includes('RESUMEN LOGISTICO'));
 assert(!(await page.locator('#modulo').innerText()).includes('VIAJES DESPACHADOS POR HORA'));
 assert(!(await page.locator('.case-trend-path').getAttribute('d')).includes('C'));
 await page.getByRole('button',{name:'Diaria',exact:true}).click();
 assert.equal(await page.locator('.dispatch-shift-visual').count(),0);
 await page.getByRole('button',{name:'DIA',exact:true}).click();
 assert.equal(await page.evaluate(()=>turnoDespachoReporte),'DIA');
 await page.getByRole('button',{name:'General',exact:true}).click();
 for(const width of [1440,390]){
 await page.setViewportSize({width,height:1000});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow');
 await page.screenshot({path:path.join(__dirname,'dispatch-'+width+'.png'),fullPage:true});
 }
 await page.evaluate(()=>abrirVistaReporte());
 await page.locator('#visorReporteContenido').getByRole('button',{name:'Diaria',exact:true}).click();
 assert.equal(await page.locator('#visorReporteContenido .dispatch-shift-visual').count(),0);
 console.log('PASS: KPIs, straight trend, daily/general, shift control, viewer, desktop/mobile.');
 }finally{await browser.close()}})().catch(e=>{console.error(e);process.exit(1)});
