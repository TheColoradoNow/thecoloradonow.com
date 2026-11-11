// @ts-nocheck
// Dashboard deployment: paste this complete file into a function named "newsletter".
// Disable gateway JWT verification for this function. Admin JWTs are verified below;
// public signups require a server-validated Turnstile token and database rate limits.
const SITE = 'https://thecoloradonow.com';
const EDITORS = ['julianhanes5@gmail.com', 'julian.hanes@thecoloradonow.com'];
const ADDRESS = '1500 N GRANT ST, STE R, Denver, CO, 80203, US';
const REQUIRED = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ANON_KEY','BREVO_API_KEY','BREVO_LIST_ID','BREVO_DOI_TEMPLATE_ID','TURNSTILE_SECRET_KEY','TURNSTILE_SITE_KEY'];
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const idPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function requiredText(value, max, label, optional = false) {
  if (typeof value !== 'string' || value.length > max || (!optional && !value.trim())) throw new HttpError(400, 'Check ' + label + '.');
  return value.trim();
}
function safeImage(value) { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch (_) { return ''; } }
export function emailHtml(draft, articles, address = ADDRESS) {
  const cards = articles.map(article => {
    const href = SITE + '/article.html?id=' + encodeURIComponent(article.id);
    const image = safeImage(article.image);
    return `<tr><td style="padding:16px 24px"><table role="presentation" width="100%" style="border:1px solid #ddd;border-radius:8px;background:#f8f8f8"><tr><td style="padding:16px">${image ? `<a href="${href}"><img src="${escape(image)}" alt="" width="500" style="display:block;width:100%;max-width:500px;height:auto;border:0;border-radius:5px"></a>` : ''}<h2 style="font: bold 22px/1.3 Georgia,serif;margin:14px 0 6px"><a href="${href}" style="color:#002868;text-decoration:none">${escape(article.title)}</a></h2><p style="margin:0 0 14px;color:#555">By ${escape(article.author || 'Colorado Now')}</p><a href="${href}" style="color:#BF0A30">Read article</a></td></tr></table></td></tr>`;
  }).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(draft.subject)}</title></head><body style="margin:0;background:#fff;color:#111;font:16px/1.6 Georgia,serif"><div style="display:none;max-height:0;overflow:hidden">${escape(draft.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center"><table role="presentation" width="600" style="width:100%;max-width:600px" cellpadding="0" cellspacing="0"><tr><td style="background:#002868;color:#fff;text-align:center;padding:22px"><a href="${SITE}" style="color:#fff;text-decoration:none;font-size:28px;font-weight:bold">Colorado Now</a><p style="margin:6px 0 0">Community-Centered, Colorado-Focused</p></td></tr><tr><td style="padding:24px"><h1 style="font-size:26px;color:#002868">${escape(draft.subject)}</h1>${draft.introduction.split(/\n\s*\n/).filter(Boolean).map(text => '<p>' + escape(text).replace(/\n/g,'<br>') + '</p>').join('')}</td></tr>${cards}<tr><td style="padding:24px;text-align:center;font-size:13px;color:#555;border-top:1px solid #ddd"><p>Colorado Now<br>${escape(address)}</p><p>You are receiving this newsletter because you subscribed.</p><a href="{{ unsubscribe }}" style="color:#BF0A30">Unsubscribe</a></td></tr></table></td></tr></table></body></html>`;
}

export function createHandler(env, dependencies = {}) {
  const request = dependencies.fetch || fetch;
  const now = dependencies.now || (() => new Date());
  const senderEmail = env.NEWSLETTER_SENDER_EMAIL || 'newsletter@thecoloradonow.com';
  const senderName = env.NEWSLETTER_SENDER_NAME || 'Colorado Now';
  const address = env.NEWSLETTER_POSTAL_ADDRESS || ADDRESS;
  const listId = Number(env.BREVO_LIST_ID);
  const templateId = Number(env.BREVO_DOI_TEMPLATE_ID);
  const missing = () => REQUIRED.filter(key => !env[key]);
  const configured = () => !missing().length && Number.isSafeInteger(listId) && listId > 0 && Number.isSafeInteger(templateId) && templateId > 0;
  async function db(method, path, body) {
    const response = await request(env.SUPABASE_URL + '/rest/v1/' + path, {
      method, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + env.SUPABASE_SERVICE_ROLE_KEY,
        'Content-Type':'application/json', Prefer:'return=representation' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw new HttpError(503, 'Newsletter database is not ready. Check the SQL setup.');
    return response.status === 204 ? null : response.json();
  }
  async function brevo(method, path, body) {
    let response;
    try { response = await request('https://api.brevo.com/v3/' + path, {
      method, headers: { 'api-key':env.BREVO_API_KEY, 'Content-Type':'application/json', Accept:'application/json' },
      body:body === undefined ? undefined : JSON.stringify(body), signal:AbortSignal.timeout(20000)
    }); } catch (_) { throw new HttpError(502, 'Brevo could not be reached. Check its dashboard before retrying a send.'); }
    if (!response.ok) {
      let details; try { details=await response.json(); } catch (_) {}
      const error = new HttpError(response.status === 429 ? 429 : 502, response.status === 402 ? 'Brevo has insufficient sending credits. Check your plan.' : 'Brevo rejected this request. Check the sender, template, list, and account status in Brevo.');
      error.definite = response.status >= 400 && response.status < 500;
      error.duplicate = details?.code === 'duplicate_parameter';
      throw error;
    }
    return response.status === 204 ? null : response.json();
  }
  async function editor(req) {
    const token = req.headers.get('authorization') || '';
    if (!token.startsWith('Bearer ')) throw new HttpError(401,'Sign in to use Newsletter tools.');
    const response = await request(env.SUPABASE_URL + '/auth/v1/user', {headers:{apikey:env.SUPABASE_ANON_KEY, Authorization:token}, signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new HttpError(401,'Your sign-in expired. Please sign in again.');
    const user = await response.json();
    if (!user.id || !user.email_confirmed_at || !EDITORS.includes(String(user.email || '').toLowerCase())) throw new HttpError(403,'This account cannot manage newsletters.');
    return user;
  }
  async function rate(key, limit, seconds) {
    const secret = await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SUPABASE_SERVICE_ROLE_KEY),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const hash = [...new Uint8Array(await crypto.subtle.sign('HMAC',secret,new TextEncoder().encode(key)))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const allowed = await db('POST','rpc/newsletter_take_rate_limit',{p_key:hash,p_limit:limit,p_seconds:seconds});
    if (allowed !== true) throw new HttpError(429,'Please wait before trying again.');
  }
  async function releasedArticles(ids) {
    let query = 'articles?select=id,title,author,image,timestamp&status=in.(published,scheduled)&publish_at=lte.' + encodeURIComponent(now().toISOString()) + '&order=timestamp.desc,id.desc';
    if (ids) query += '&id=in.(' + ids.join(',') + ')';
    const result = await db('GET',query + '&limit=1000');
    if (!ids) return result;
    const indexed = new Map(result.map(article=>[String(article.id),article]));
    if (ids.some(id=>!indexed.has(id))) throw new HttpError(400,'Some selected articles are no longer published. Update the selection.');
    return ids.map(id=>indexed.get(id));
  }
  async function campaign(id) {
    if (typeof id !== 'string' || !idPattern.test(id)) throw new HttpError(400,'Choose a saved newsletter.');
    const rows = await db('GET','newsletter_campaigns?id=eq.'+id+'&limit=1');
    if (!rows[0]) throw new HttpError(404,'Newsletter not found.');
    return rows[0];
  }
  async function change(row, updates, expectedStatus = row.status) {
    const rows = await db('PATCH','newsletter_campaigns?id=eq.'+row.id+'&revision=eq.'+row.revision+'&status=eq.'+expectedStatus,{...updates,updated_at:now().toISOString()});
    if (!rows.length) throw new HttpError(409,'This newsletter changed in another window. Reload it before continuing.');
    return rows[0];
  }
  function payload(row) { return {name:'Colorado Now: '+row.subject,subject:row.subject,previewText:row.preheader,sender:{email:senderEmail,name:senderName},replyTo:senderEmail,htmlContent:row.html,recipients:{listIds:[listId]},type:'classic',tag:'colorado-now-newsletter'}; }
  async function integrationStatus() {
    const [list, template, senders] = await Promise.all([brevo('GET','contacts/lists/'+listId),brevo('GET','smtp/templates/'+templateId),brevo('GET','senders')]);
    if (!senders.senders?.some(sender=>sender.active && sender.email?.toLowerCase()===senderEmail.toLowerCase())) throw new HttpError(503,'Verify newsletter@thecoloradonow.com as a sender in Brevo.');
    if (template.isActive !== true) throw new HttpError(503,'The template selected by BREVO_DOI_TEMPLATE_ID is inactive. Activate it in Brevo or correct the ID in Supabase.');
    // The DOI flag is optional. Check the confirmation link our API flow actually needs.
    const templateHtml = String(template.htmlContent || '').replace(/<!--[\s\S]*?-->/g, '');
    const hasConfirmationLink = /<a\b[^>]*\s+href\s*=\s*(["'])\s*\{\{\s*params\.DOIurl\s*\}\}\s*\1/i.test(templateHtml);
    if (!hasConfirmationLink) throw new HttpError(503,'The selected Brevo template does not contain the API confirmation link. Check BREVO_DOI_TEMPLATE_ID and restore the supplied confirmation email HTML.');
    return {subscribers:Number(list.totalSubscribers || 0),blocked:Number(list.totalBlacklisted || 0),sender:senderEmail,senderName,address};
  }
  async function fingerprint(provider) {
    const value=JSON.stringify({subject:provider.subject,html:provider.htmlContent,sender:provider.sender?.email,lists:provider.recipients?.lists});
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  return async function handler(req) {
    const origin = req.headers.get('origin');
    const allowedOrigins = [SITE,'https://www.thecoloradonow.com'];
    const headers = {'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',Vary:'Origin'};
    if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin']=origin;
    const json = (body,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if (origin && !allowedOrigins.includes(origin)) return json({error:'Origin not allowed.'},403);
    if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info'}});
    try {
      if (req.method === 'GET') {
        return json({ready:configured() && env.NEWSLETTER_PUBLIC_ENABLED === 'true',siteKey:configured() && env.NEWSLETTER_PUBLIC_ENABLED === 'true' ? env.TURNSTILE_SITE_KEY : null});
      }
      if (req.method !== 'POST') throw new HttpError(405,'Method not allowed.');
      if (!req.headers.get('content-type')?.startsWith('application/json')) throw new HttpError(415,'JSON is required.');
      if (Number(req.headers.get('content-length')) > 32768) throw new HttpError(413,'Request too large.');
      const reader=req.body?.getReader(); const chunks=[]; let size=0;
      if (!reader) throw new HttpError(400,'Invalid request.');
      while (true) { const part=await reader.read(); if(part.done)break; size+=part.value.byteLength; if(size>32768){await reader.cancel();throw new HttpError(413,'Request too large.');} chunks.push(part.value); }
      const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.byteLength;}
      const raw = new TextDecoder().decode(bytes);
      let input; try { input=JSON.parse(raw); } catch (_) { throw new HttpError(400,'Invalid request.'); }
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new HttpError(400,'Invalid request.');
      if (input.action === 'subscribe') {
        if (!configured() || env.NEWSLETTER_PUBLIC_ENABLED !== 'true') throw new HttpError(503,'Email signup is not available yet. Please use the Substack link.');
        if (input.website) return json({message:'If eligible, you will receive an email with a confirmation link.'});
        const email=requiredText(input.email,254,'email address').toLowerCase();
        if (!emailPattern.test(email) || input.consent !== true) throw new HttpError(400,'Enter your email address and check the newsletter consent box.');
        const token=requiredText(input.captchaToken,2048,'security check');
        const check=await request('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:env.TURNSTILE_SECRET_KEY,response:token}),signal:AbortSignal.timeout(10000)});
        const captcha=await check.json();
        if (!captcha.success || !['thecoloradonow.com','www.thecoloradonow.com'].includes(captcha.hostname) || captcha.action !== 'newsletter') throw new HttpError(400,'Please complete the security check again.');
        const ip=(req.headers.get('cf-connecting-ip') || (req.headers.get('x-forwarded-for') || '').split(',').at(-1) || '').trim();
        if (!ip) throw new HttpError(503,'Signup is temporarily unavailable.');
        await rate('signup-ip:'+ip,5,3600); await rate('signup-email:'+email,2,86400); await rate('signup-total',100,86400);
        // Brevo adds the address to this dedicated list only after confirmation.
        // Never set emailBlacklisted=false or import an unconfirmed contact.
        try { await brevo('POST','contacts/doubleOptinConfirmation',{email,includeListIds:[listId],templateId,redirectionUrl:SITE+'/subscribe.html?confirmed=1',contactPixelTrackingConsent:false}); }
        catch (error) { if(!error.duplicate)throw error; }
        return json({message:'If this address is eligible, a confirmation email is on its way. Check your inbox and confirm to join the newsletter.'});
      }
      const user=await editor(req);
      if (input.action === 'status') {
        if (!configured()) return json({ready:false,missing:missing(),message:'Finish the Supabase secret settings and Brevo setup before sending.'});
        await db('GET','newsletter_campaigns?select=id&limit=1');
        return json({ready:true,publicEnabled:env.NEWSLETTER_PUBLIC_ENABLED==='true',...await integrationStatus()});
      }
      if (!configured()) throw new HttpError(503,'Finish newsletter setup before using these controls.');
      if (input.action === 'articles') return json({articles:await releasedArticles()});
      if (input.action === 'list') return json({drafts:await db('GET','newsletter_campaigns?select=id,subject,status,revision,tested_revision,brevo_id,scheduled_at,updated_at&order=updated_at.desc&limit=100')});
      if (input.action === 'load') return json({draft:await campaign(input.id)});
      if (input.action === 'save') {
        const subject=requiredText(input.subject,150,'subject'),preheader=requiredText(input.preheader || '',160,'preview text',true),introduction=requiredText(input.introduction || '',6000,'introduction',true);
        if (!Array.isArray(input.articleIds) || input.articleIds.length < 1 || input.articleIds.length > 12) throw new HttpError(400,'Choose between 1 and 12 published articles.');
        const article_ids=[...new Set(input.articleIds.map(String))];
        if (article_ids.some(id=>!/^\d{1,19}$/.test(id))) throw new HttpError(400,'Invalid article selection.');
        const articles=await releasedArticles(article_ids);
        const content={subject,preheader,introduction,article_ids};
        const html=emailHtml(content,articles,address);
        let row;
        if (input.id) {
          row=await campaign(input.id);
          if (row.status!=='draft' || input.revision!==row.revision) throw new HttpError(409,'This newsletter cannot be edited. Reload it or create a new draft.');
          row=await change(row,{...content,html,revision:row.revision+1,tested_revision:null,provider_fingerprint:null});
        } else {
          [row]=await db('POST','newsletter_campaigns',{...content,html,created_by:user.id});
        }
        return json({draft:row});
      }
      if (input.action === 'test') {
        let row=await campaign(input.id);
        if (row.status!=='draft' || row.revision!==input.revision) throw new HttpError(409,'Save or reload this draft before testing.');
        await integrationStatus();
        await rate('test:'+user.id,10,3600);
        row=await change(row,{status:'preparing',tested_revision:null,provider_fingerprint:null});
        try {
          if (row.brevo_id) await brevo('PUT','emailCampaigns/'+row.brevo_id,payload(row));
          else {
            const created=await brevo('POST','emailCampaigns',payload(row));
            if (!Number.isSafeInteger(created.id)) throw new HttpError(502,'Brevo did not return a campaign ID.');
            row=await change(row,{brevo_id:created.id});
          }
          await brevo('POST','emailCampaigns/'+row.brevo_id+'/sendTest',{emailTo:[user.email]});
          const tested=await brevo('GET','emailCampaigns/'+row.brevo_id);
          row=await change(row,{status:'draft',tested_revision:row.revision,provider_fingerprint:await fingerprint(tested)});
          return json({draft:row,message:'Test email requested for '+user.email+'. Check your inbox before sending.'});
        } catch (error) { await change(row,{status:'draft',tested_revision:null}).catch(()=>{}); throw error; }
      }
      if (input.action === 'send' || input.action === 'schedule') {
        let row=await campaign(input.id);
        if (row.status!=='draft' || row.revision!==input.revision || row.tested_revision!==row.revision || !row.brevo_id) throw new HttpError(409,'Save this version and send a test email before sending to subscribers.');
        if (input.confirmation!==row.id+':'+row.revision) throw new HttpError(400,'Confirm this newsletter before sending.');
        let scheduledAt=null;
        if (input.action==='schedule') {
          const time=new Date(input.scheduledAt);
          if (!Number.isFinite(time.getTime()) || time.getTime()<now().getTime()+60000 || time.getTime()>now().getTime()+366*86400000) throw new HttpError(400,'Choose a valid future time within the next year.');
          scheduledAt=time.toISOString();
        }
        const status=await integrationStatus();
        if (status.subscribers<1) throw new HttpError(400,'No confirmed subscribers are available yet.');
        const provider=await brevo('GET','emailCampaigns/'+row.brevo_id);
        if (provider.status!=='draft' || !row.provider_fingerprint || await fingerprint(provider)!==row.provider_fingerprint || provider.recipients?.lists?.length!==1 || Number(provider.recipients.lists[0])!==listId) throw new HttpError(409,'The campaign changed in Brevo. Check its dashboard before continuing.');
        await releasedArticles(row.article_ids);
        row=await change(row,{status:'submitting'});
        let accepted=false;
        try {
          if (scheduledAt) await brevo('PUT','emailCampaigns/'+row.brevo_id,{scheduledAt});
          else await brevo('POST','emailCampaigns/'+row.brevo_id+'/sendNow');
          accepted=true;
          row=await change(row,{status:scheduledAt?'scheduled':'submitted',scheduled_at:scheduledAt});
          return json({draft:row,message:scheduledAt?'Newsletter scheduled in Brevo.':'Brevo accepted the newsletter for delivery. Check its report for delivery progress.'});
        } catch (error) {
          await change(row,{status:!accepted && error.definite?'draft':'review_required'}).catch(()=>{});
          throw new HttpError(502,'Sending was not confirmed. Check the campaign in Brevo before trying again.');
        }
      }
      if (input.action === 'report') {
        const row=await campaign(input.id);
        if (!row.brevo_id) return json({draft:row,statistics:null});
        const report=await brevo('GET','emailCampaigns/'+row.brevo_id);
        let next=row;
        if (report.status==='sent' && row.status!=='draft') next=await change(row,{status:'sent'});
        return json({draft:next,providerStatus:report.status,statistics:report.statistics?.globalStats || null});
      }
      throw new HttpError(400,'Unknown newsletter action.');
    } catch (error) {
      // Never return provider payloads, contact records, tokens, or secret values.
      return json({error:error instanceof HttpError ? error.message : 'Newsletter service is temporarily unavailable.'},error instanceof HttpError ? error.status : 503);
    }
  };
}
if (typeof Deno !== 'undefined') Deno.serve(createHandler(Deno.env.toObject()));
