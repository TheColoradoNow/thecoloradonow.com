(function () {
  'use strict';
  const app=window.TheColoradoNow;
  if (!app?.supabaseUrl) return;
  const endpoint=app.supabaseUrl+'/functions/v1/newsletter';
  async function api(action,body={}) {
    const headers={'Content-Type':'application/json',apikey:app.supabaseAnonKey};
    if (action!=='subscribe') {
      const {data,error}=await app.supabase.auth.getSession();
      if (error || !data?.session) throw new Error('Please sign in again before using Newsletter tools.');
      headers.Authorization='Bearer '+data.session.access_token;
    }
    let response;
    try { response=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({action,...body})}); }
    catch (_) { throw new Error('Newsletter connection is not ready. Please try again later.'); }
    let data; try { data=await response.json(); } catch (_) { throw new Error('Newsletter service is temporarily unavailable.'); }
    if (!response.ok) throw new Error(typeof data.error==='string'?data.error:'Newsletter connection is not ready. Complete the Supabase setup first.');
    return data;
  }
  async function signup() {
    const form=document.getElementById('newsletterSignup');
    if (!form) return;
    const result=document.getElementById('newsletterSignupStatus');
    const button=document.getElementById('newsletterSubscribe');
    const consent=document.getElementById('newsletterConsent');
    let token='',widget=null,busy=false;
    function update(){button.disabled=busy || !token || !consent.checked;}
    if (new URLSearchParams(location.search).get('confirmed')==='1') {
      document.getElementById('newsletterConfirmation').hidden=false;
    }
    try {
      const response=await fetch(endpoint,{headers:{apikey:app.supabaseAnonKey}});
      if (!response.ok) return;
      const config=await response.json();
      if (!config.ready || !config.siteKey) return;
      await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';script.onload=resolve;script.onerror=reject;document.head.appendChild(script)});
      widget=window.turnstile.render('#newsletterCaptcha',{sitekey:config.siteKey,action:'newsletter',callback:value=>{token=value;update()},'expired-callback':()=>{token='';update()},'error-callback':()=>{token='';update()}});
      form.hidden=false;
      document.getElementById('newsletterIntro').textContent='Get Colorado stories and community reporting delivered to your inbox.';
      document.getElementById('substackFallbackNote').textContent='Prefer Substack? You can also subscribe there.';
    } catch (_) { return; }
    consent.addEventListener('change',update);
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy || !token || !consent.checked)return;
      busy=true;update();result.textContent='Sending your confirmation email...';
      try {
        const data=await api('subscribe',{email:document.getElementById('newsletterEmail').value,consent:consent.checked,captchaToken:token,website:document.getElementById('newsletterWebsite').value});
        result.textContent=data.message;form.reset();
      }catch(error){result.textContent=error.message;}
      finally{busy=false;token='';window.turnstile.reset(widget);update();}
    });
  }
  function admin() {
    const panel=document.getElementById('newsletter-panel');if(!panel)return;
    const status=document.getElementById('newsletterAdminStatus');
    const form=document.getElementById('newsletterDraftForm');
    const list=document.getElementById('newsletterDrafts');
    const choices=document.getElementById('newsletterArticles');
    const videoSection=document.getElementById('newsletterVideoSection');
    const videoFields=document.getElementById('newsletterVideos');
    const preview=document.getElementById('newsletterPreview');
    const previewStatus=document.getElementById('newsletterPreviewStatus');
    const subject=document.getElementById('newsletterSubject');
    const preheader=document.getElementById('newsletterPreheader');
    const introduction=document.getElementById('newsletterIntroduction');
    const controls=[...panel.querySelectorAll('[data-newsletter-action]')];
    let current=null,ready=false,dirty=false,busy=false,loaded=false,articles=[],subscribers=0,contentDetails=false;
    function message(text,error=false){status.textContent=text;status.classList.toggle('auth-status-error',error);}
    function buttons(){
      controls.forEach(button=>{
        const action=button.dataset.newsletterAction;
        button.disabled=busy || (!ready&&!['connect'].includes(action));
        if(['test','send','schedule','report'].includes(action)) button.disabled ||= !current;
        if(['test','send','schedule'].includes(action)) button.disabled ||= dirty || current?.status!=='draft';
        if(['send','schedule'].includes(action))button.disabled ||= current?.tested_revision!==current?.revision;
      });
      [...form.querySelectorAll('input,textarea,button')].forEach(input=>{input.disabled=busy || !ready || !!(current&&current.status!=='draft');});
    }
    function drawArticles(selected=[],descriptions={}){
      choices.replaceChildren();
      articles.forEach(article=>{
        const card=document.createElement('div');
        const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
        input.type='checkbox';input.name='newsletterArticle';input.value=String(article.id);
        input.checked=selected.includes(input.value);text.textContent=article.title;label.append(input,text);card.appendChild(label);
        if(contentDetails){
          const field=document.createElement('div'),description=document.createElement('textarea');
          description.rows=2;description.maxLength=1000;description.value=descriptions[input.value]||'';
          description.placeholder='Optional article description';
          description.setAttribute('aria-label','Description for '+article.title);
          field.hidden=!input.checked;field.appendChild(description);card.appendChild(field);
          input.addEventListener('change',()=>{field.hidden=!input.checked;});
        }
        choices.appendChild(card);
      });
    }
    function addVideo(video={}){
      const row=document.createElement('fieldset');
      const legend=document.createElement('legend');
      legend.textContent='YouTube video';row.appendChild(legend);
      const fields=[
        ['YouTube video link','url','url',2048,video.id?'https://www.youtube.com/watch?v='+video.id:''],
        ['Video title','title','text',200,video.title||''],
        ['Optional video description','description','textarea',1000,video.description||'']
      ];
      fields.forEach(([caption,name,type,max,value])=>{
        const label=document.createElement('label');
        const field=document.createElement(type==='textarea'?'textarea':'input');
        if(type==='textarea')field.rows=2;
        else {field.type=type;field.required=true;}
        field.name=name;field.maxLength=max;field.value=value;
        label.append(caption,field);row.appendChild(label);
      });
      const remove=document.createElement('button');
      remove.type='button';remove.className='secondary-button';remove.textContent='Remove video';
      remove.addEventListener('click',()=>{row.remove();markDirty();});
      row.appendChild(remove);videoFields.appendChild(row);
      return row;
    }
    function markDirty(){
      dirty=true;
      previewStatus.textContent=preview.hidden
        ? 'Save & Preview Draft to see the email.'
        : 'Showing the last saved draft. Save & Preview Draft to see your edits.';
      buttons();
    }
    function show(row){
      current=row;dirty=false;subject.value=row?.subject||'';preheader.value=row?.preheader||'';introduction.value=row?.introduction||'';
      drawArticles(row?.article_ids||[],row?.content_details?.descriptions);
      videoSection.hidden=!contentDetails;
      videoFields.replaceChildren();
      if(contentDetails)for(const video of row?.content_details?.videos||[])addVideo(video);
      const hasPreview=typeof row?.html==='string' && row.html.trim().length>0;
      preview.hidden=!hasPreview;
      previewStatus.textContent=hasPreview ? '' : 'Save a draft or open a saved draft to see the email preview.';
      if(hasPreview)preview.srcdoc=row.html.replace('<head>','<head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'">');else preview.srcdoc='';
      const link=document.getElementById('newsletterBrevoLink');link.hidden=!row?.brevo_id;if(row?.brevo_id)link.href='https://app.brevo.com/';
      buttons();
    }
    async function refreshList(){
      const data=await api('list');list.replaceChildren();
      data.drafts.forEach(row=>{const item=document.createElement('button');item.type='button';item.className='newsletter-draft-button';item.textContent=row.subject+' — '+row.status.replaceAll('_',' ');item.addEventListener('click',()=>run(async()=>{if(dirty&&!window.confirm('Discard unsaved newsletter edits?'))return;const data=await api('load',{id:row.id});show(data.draft);message('Newsletter loaded. Status: '+data.draft.status.replaceAll('_',' ')+'.')}));list.appendChild(item);});
      if(!data.drafts.length)list.textContent='No newsletters saved yet.';
    }
    async function connect(){
      const data=await api('status');ready=data.ready;
      if(!ready){message((data.message||'Finish newsletter setup.')+(data.missing?.length?' Missing settings: '+data.missing.join(', '):''),true);return;}
      subscribers=data.subscribers;
      document.getElementById('newsletterCounts').textContent=subscribers+' confirmed subscribers • '+data.blocked+' blocked addresses • Sender: '+data.sender;
      const result=await api('articles');articles=result.articles;contentDetails=data.contentDetails===true;
      if(!dirty)show(current);
      await refreshList();loaded=true;
      message(data.publicEnabled?'Connected to Brevo. Save a draft, preview it, and request a test before sending.':'Connected to Brevo. New website signups are not enabled yet; the Substack link remains available.');
    }
    async function run(work){if(busy)return;busy=true;buttons();try{await work()}catch(error){message(error.message,true)}finally{busy=false;buttons()}}
    document.querySelector('[data-panel="newsletter-panel"]').addEventListener('click',()=>{if(!loaded)run(connect)});
    form.addEventListener('input',markDirty);
    document.getElementById('newsletterAddVideo').addEventListener('click',()=>{
      if(videoFields.children.length>=12){message('A newsletter can contain up to 12 posts.',true);return;}
      addVideo().querySelector('input').focus();markDirty();
    });
    form.addEventListener('submit',event=>{event.preventDefault();run(async()=>{
      const selected=[...choices.querySelectorAll('input:checked')];
      const body={id:current?.id,revision:current?.revision,subject:subject.value,preheader:preheader.value,introduction:introduction.value,articleIds:selected.map(input=>input.value)};
      if(contentDetails){
        body.descriptions=Object.fromEntries(selected.map(input=>[input.value,input.closest('label').parentElement.querySelector('textarea').value]));
        body.videos=[...videoFields.children].map(row=>({
          id:app.videoTile.videoIdFromUrl(row.querySelector('[name="url"]').value),
          title:row.querySelector('[name="title"]').value,
          description:row.querySelector('[name="description"]').value
        }));
      }
      const result=await api('save',body);show(result.draft);await refreshList();message('Draft saved. Preview it below, then request a test email.');
    })});
    controls.forEach(button=>button.addEventListener('click',()=>run(async()=>{
      const action=button.dataset.newsletterAction;
      if(action==='connect'){await connect();return;}
      if(action==='new'){if(dirty&&!window.confirm('Discard unsaved newsletter edits?'))return;show(null);message('Choose articles and save a new newsletter draft.');return;}
      if(action==='report'){const data=await api('report',{id:current.id});show(data.draft);const stats=data.statistics;message(stats?'Brevo status: '+data.providerStatus+'. Delivered: '+(stats.delivered||0)+' • Bounces: '+((stats.hardBounces||0)+(stats.softBounces||0))+' • Unsubscribes: '+(stats.unsubscriptions||0):'No delivery report yet. Status: '+data.draft.status.replaceAll('_',' '));return;}
      if(action==='test'){const data=await api('test',{id:current.id,revision:current.revision});show(data.draft);message(data.message);await refreshList();return;}
      if(action==='send'||action==='schedule'){
        let scheduledAt=null;
        if(action==='schedule'){const value=document.getElementById('newsletterSchedule').value;if(!value){message('Choose a future date and time.',true);return;}const time=new Date(value);if(!Number.isFinite(time.getTime())){message('Choose a valid date and time.',true);return;}scheduledAt=time.toISOString();}
        const when=scheduledAt?'Schedule for '+new Date(scheduledAt).toLocaleString():'Send now';
        if(!window.confirm(when+'?\n\n'+current.subject+'\nAudience: '+subscribers+' confirmed subscribers (the list can change before delivery).\n\nConfirm that you reviewed the test email.'))return;
        const data=await api(action,{id:current.id,revision:current.revision,confirmation:current.id+':'+current.revision,scheduledAt});show(data.draft);message(data.message);await refreshList();
      }
    })));
    document.getElementById('newsletterTimeZone').textContent='Schedule time uses your device timezone: '+Intl.DateTimeFormat().resolvedOptions().timeZone+'.';
    buttons();
  }
  signup();admin();
})();
