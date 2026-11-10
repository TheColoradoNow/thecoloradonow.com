import assert from 'node:assert/strict';
import {createHandler,emailHtml} from '../supabase/functions/newsletter/index.ts';
const origin='https://thecoloradonow.com',base='https://database.test';
const env={SUPABASE_URL:base,SUPABASE_SERVICE_ROLE_KEY:'server-service-secret',SUPABASE_ANON_KEY:'public-key',BREVO_API_KEY:'private-brevo-secret',BREVO_LIST_ID:'12',BREVO_DOI_TEMPLATE_ID:'34',TURNSTILE_SECRET_KEY:'private-captcha-secret',TURNSTILE_SITE_KEY:'public-site-key',NEWSLETTER_PUBLIC_ENABLED:'true'};
const now=()=>new Date('2026-11-09T18:00:00Z');
let rows=[],providers=new Map(),sendCalls=0,testCalls=[],doiCalls=[],rateKeys=[],rateAllowed=true,captchaGood=true,duplicate=false,sendMode='ok',next=1;
const response=(data,status=200)=>new Response(status===204?null:JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const fetchMock=async(url,options={})=>{
 const u=new URL(url),method=options.method||'GET',body=options.body?JSON.parse(options.body):null;
 if(u.hostname==='challenges.cloudflare.com')return response({success:captchaGood,hostname:'thecoloradonow.com',action:'newsletter'});
 if(u.origin===base){
  if(u.pathname==='/auth/v1/user'){const auth=options.headers.Authorization;if(auth==='Bearer expired')return response({},401);return response({id:'11111111-1111-4111-8111-111111111111',email:auth==='Bearer intruder'?'intruder@example.com':'julian.hanes@thecoloradonow.com',email_confirmed_at:now().toISOString()});}
  assert.equal(options.headers.Authorization,'Bearer '+env.SUPABASE_SERVICE_ROLE_KEY);
  if(u.pathname.endsWith('/rpc/newsletter_take_rate_limit')){rateKeys.push(body.p_key);assert.match(body.p_key,/^[a-f0-9]{64}$/);return response(rateAllowed);}
  if(u.pathname.endsWith('/articles')){assert(u.searchParams.get('status').includes('published'));assert(u.searchParams.get('publish_at').startsWith('lte.'));const ids=u.searchParams.get('id');const articles=[{id:1,title:'Colorado <news>',author:'Reporter',image:'https://example.com/image.jpg',timestamp:now().toISOString()}];return response(ids?articles.filter(a=>ids.slice(4,-1).split(',').includes(String(a.id))):articles);}
  if(u.pathname.endsWith('/newsletter_campaigns')){
   let selected=rows.filter(row=>(!u.searchParams.has('id')||u.searchParams.get('id')==='eq.'+row.id)&&(!u.searchParams.has('revision')||u.searchParams.get('revision')==='eq.'+row.revision)&&(!u.searchParams.has('status')||u.searchParams.get('status')==='eq.'+row.status));
   if(method==='POST'){const row={id:'22222222-2222-4222-8222-'+String(next++).padStart(12,'0'),revision:1,tested_revision:null,provider_fingerprint:null,brevo_id:null,status:'draft',created_at:now().toISOString(),updated_at:now().toISOString(),...body};rows.push(row);selected=[row];}
   if(method==='PATCH')selected.forEach(row=>Object.assign(row,body));
   return response(structuredClone(selected));
  }
 }
 if(u.hostname==='api.brevo.com'){
  assert.equal(options.headers['api-key'],env.BREVO_API_KEY);const route=u.pathname.replace('/v3/','');
  if(route==='contacts/lists/12')return response({totalSubscribers:20,totalBlacklisted:2});
  if(route==='smtp/templates/34')return response({isActive:true,doiTemplate:true});
  if(route==='senders')return response({senders:[{active:true,email:'newsletter@thecoloradonow.com'}]});
  if(route==='contacts/doubleOptinConfirmation'){doiCalls.push(body);return duplicate?response({code:'duplicate_parameter'},400):response({},201);}
  if(route==='emailCampaigns'&&method==='POST'){const id=providers.size+100;providers.set(id,{id,status:'draft',subject:body.subject,htmlContent:body.htmlContent+'<!-- provider normalized -->',sender:body.sender,recipients:{lists:body.recipients.listIds}});return response({id},201);}
  const match=route.match(/^emailCampaigns\/(\d+)(.*)$/);if(match){const id=Number(match[1]),row=providers.get(id);assert(row);
   if(match[2]==='/sendTest'){testCalls.push(body);return response(null,204);}
   if(match[2]==='/sendNow'){sendCalls++;if(sendMode==='timeout')throw new Error('network timeout '+env.BREVO_API_KEY);if(sendMode==='credits')return response({},402);row.status='queued';return response(null,204);}
   if(method==='PUT'){if(body.scheduledAt){row.scheduledAt=body.scheduledAt;row.status='queued';}else Object.assign(row,{subject:body.subject,htmlContent:body.htmlContent+'<!-- provider normalized -->',sender:body.sender,recipients:{lists:body.recipients.listIds}});return response(null,204);}
   return response(structuredClone(row));
  }
 }
 throw new Error('Unexpected request: '+url);
};
const handle=createHandler(env,{fetch:fetchMock,now});
async function call(action,body={},token='editor',extra={}){const headers={Origin:origin,'Content-Type':'application/json','x-forwarded-for':'198.51.100.1',...(token?{Authorization:'Bearer '+token}:{}),...extra};const r=await handle(new Request(base+'/functions/v1/newsletter',{method:'POST',headers,body:JSON.stringify({action,...body})}));const data=await r.json();assert(!JSON.stringify(data).includes(env.BREVO_API_KEY));assert(!JSON.stringify(data).includes(env.SUPABASE_SERVICE_ROLE_KEY));return {status:r.status,...data};}
assert.equal((await call('list',{},null)).status,401);assert.equal((await call('list',{},'intruder')).status,403);assert.equal((await call('list',{},'expired')).status,401);assert.equal((await call('list',{},'editor',{Origin:'https://evil.test'})).status,403);
const publicConfig=await (await handle(new Request(base,{headers:{Origin:origin}}))).json();assert.deepEqual(publicConfig,{ready:true,siteKey:'public-site-key'});
const incomplete=createHandler({...env,BREVO_API_KEY:''},{fetch:fetchMock,now});assert.equal((await (await incomplete(new Request(base))).json()).ready,false);
const status=await call('status');assert.equal(status.ready,true);assert.equal(status.subscribers,20);
const draftInput={subject:'Weekly <script>unsafe</script>',preheader:'This week',introduction:'Hello <img src=x onerror=alert(1)>',articleIds:['1']};
assert.equal((await call('save',{...draftInput,articleIds:['999']})).status,400);assert.equal((await call('save',{...draftInput,articleIds:['1)or(1=1']})).status,400);
let data=await call('save',draftInput),row=data.draft;assert.equal(data.status,200);assert(row.html.includes('&lt;script&gt;'));assert(!row.html.includes('<img src=x'));assert(row.html.includes('{{ unsubscribe }}'));assert(row.html.includes('1500 N GRANT ST'));
assert.equal((await call('send',{id:row.id,revision:row.revision,confirmation:row.id+':'+row.revision})).status,409);
data=await call('test',{id:row.id,revision:row.revision,emailTo:['victim@example.com']});row=data.draft;assert.equal(row.tested_revision,1);assert.deepEqual(testCalls[0],{emailTo:['julian.hanes@thecoloradonow.com']});assert(row.provider_fingerprint);
data=await call('save',{...draftInput,id:row.id,revision:row.revision,subject:'Edited version'});row=data.draft;assert.equal(row.tested_revision,null);assert.equal((await call('test',{id:row.id,revision:1})).status,409);row=(await call('test',{id:row.id,revision:row.revision})).draft;
const sendBody={id:row.id,revision:row.revision,confirmation:row.id+':'+row.revision};const concurrent=await Promise.all([call('send',sendBody),call('send',sendBody)]);assert.equal(concurrent.filter(r=>r.status===200).length,1);assert.equal(sendCalls,1);assert.equal((await call('send',sendBody)).status,409);
row=(await call('save',{...draftInput,subject:'Scheduled newsletter'})).draft;row=(await call('test',{id:row.id,revision:row.revision})).draft;assert.equal((await call('schedule',{id:row.id,revision:row.revision,confirmation:row.id+':'+row.revision,scheduledAt:'bad'})).status,400);data=await call('schedule',{id:row.id,revision:row.revision,confirmation:row.id+':'+row.revision,scheduledAt:'2026-11-10T18:00:00Z'});assert.equal(data.draft.status,'scheduled');
row=(await call('save',{...draftInput,subject:'Provider edit check'})).draft;row=(await call('test',{id:row.id,revision:row.revision})).draft;providers.get(row.brevo_id).htmlContent+='external change';assert.equal((await call('send',{id:row.id,revision:row.revision,confirmation:row.id+':'+row.revision})).status,409);
row=(await call('save',{...draftInput,subject:'Timeout check'})).draft;row=(await call('test',{id:row.id,revision:row.revision})).draft;sendMode='timeout';assert.equal((await call('send',{id:row.id,revision:row.revision,confirmation:row.id+':'+row.revision})).status,502);assert.equal(rows.find(r=>r.id===row.id).status,'review_required');assert.equal((await call('send',{id:row.id,revision:row.revision,confirmation:row.id+':'+row.revision})).status,409);sendMode='ok';
const signup={email:'Reader@Example.com',consent:true,captchaToken:'valid-token'};captchaGood=false;assert.equal((await call('subscribe',signup,null)).status,400);captchaGood=true;assert.equal((await call('subscribe',{...signup,consent:false},null)).status,400);data=await call('subscribe',signup,null);assert.equal(data.status,200);assert.deepEqual(doiCalls.at(-1),{email:'reader@example.com',includeListIds:[12],templateId:34,redirectionUrl:origin+'/subscribe.html?confirmed=1',contactPixelTrackingConsent:false});assert(!('emailBlacklisted' in doiCalls.at(-1)));duplicate=true;assert.equal((await call('subscribe',signup,null)).message,data.message);duplicate=false;rateAllowed=false;const before=doiCalls.length;assert.equal((await call('subscribe',signup,null)).status,429);assert.equal(doiCalls.length,before);rateAllowed=true;
assert.equal((await call('subscribe',{...signup,website:'spam'},null)).status,200);assert(rateKeys.every(key=>!key.includes('reader')));
const oversized=await handle(new Request(base,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'x'.repeat(32769)}));assert.equal(oversized.status,413);
console.log('PASS: server authorization, origin checks, secret isolation, draft validation and escaping, released-article filtering, versioned test-before-send, provider-change detection, exactly-once send locking, scheduling, ambiguous-send protection, signup consent/captcha/rate limits, DOI payload, and duplicate-address privacy.');
