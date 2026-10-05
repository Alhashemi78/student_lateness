const ORIGIN = 'https://alhashemi78.github.io';
const headers = {'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
const env=(key:string)=>Deno.env.get(key)||'';
const hex=(b:ArrayBuffer)=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
async function db(path:string,init:RequestInit={}) {return fetch(env('SUPABASE_URL')+'/rest/v1/'+path,{...init,headers:{apikey:env('SUPABASE_SERVICE_ROLE_KEY'),Authorization:'Bearer '+env('SUPABASE_SERVICE_ROLE_KEY'),'Content-Type':'application/json',...init.headers}});}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.headers.get('origin')&&req.headers.get('origin')!==ORIGIN)return reply({error:'مصدر غير مسموح'},403);
 if(req.method==='GET')return reply({ready:!!env('CLOUDINARY_API_SECRET')});
 if(req.method!=='POST')return reply({error:'طلب غير مدعوم'},405);
 try {
 const auth=req.headers.get('authorization')||'';
 const u=await fetch(env('SUPABASE_URL')+'/auth/v1/user',{headers:{apikey:env('SUPABASE_ANON_KEY'),Authorization:auth}});
 if(!u.ok)return reply({error:'سجّل الدخول أولًا'},401);
 const user=await u.json();
 const access=await db('school_image_access?user_id=eq.'+user.id+'&select=user_id');
 if(!access.ok||!(await access.json()).length)return reply({error:'الحساب غير مصرح له بهذا التطبيق'},403);
 if(!env('CLOUDINARY_API_SECRET'))return reply({error:'ينتظر تفعيل الرفع: أضف CLOUDINARY_API_SECRET في أسرار Supabase.'},503);
 if(Number(req.headers.get('content-length'))>2300000)return reply({error:'الصورة أكبر من الحد المسموح'},413);
 const form=await req.formData();const file=form.get('file');const name=String(form.get('name')||'').trim();const id=String(form.get('id')||'');const original=Number(form.get('original_bytes'));
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)||!name||name.length>150||!(file instanceof File)||file.type!=='image/jpeg'||file.size<1||file.size>2097152||!Number.isInteger(original)||original<1||original>20971520)return reply({error:'بيانات أو صورة غير صالحة'},400);
 const bytes=new Uint8Array(await file.arrayBuffer());if(bytes[0]!==255||bytes[1]!==216||bytes[2]!==255)return reply({error:'الصورة يجب أن تكون JPEG'},400);
 const prior=await db('school_image_records?id=eq.'+id+'&select=*');if(!prior.ok)throw new Error('database');const existing=await prior.json();if(existing.length)return existing[0].owner_id===user.id?reply({record:existing[0]}):reply({error:'معرف غير صالح'},409);
 const ts=Math.floor(Date.now()/1000);const pid='school_images_test/'+user.id+'/'+id;
 const params:{[key:string]:string}={overwrite:'false',public_id:pid,timestamp:String(ts),upload_preset:'school_images_test'};
 const payload=Object.keys(params).sort().map(k=>k+'='+params[k]).join('&')+env('CLOUDINARY_API_SECRET');
 const signature=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(payload)));
 const upload=new FormData();for(const[k,v]of Object.entries(params))upload.set(k,v);upload.set('api_key','282768485726168');upload.set('signature',signature);upload.set('file',file,'photo.jpg');
 const c=await fetch('https://api.cloudinary.com/v1_1/uot1nayb/image/upload',{method:'POST',body:upload});let image=await c.json();
 // A previous upload can survive a failed database write. Reuse its deterministic ID.
 if(!c.ok||image.existing){const a=await fetch('https://api.cloudinary.com/v1_1/uot1nayb/resources/image/upload/'+encodeURIComponent(pid),{headers:{Authorization:'Basic '+btoa('282768485726168:'+env('CLOUDINARY_API_SECRET'))}});if(!a.ok)return reply({error:'تعذر رفع الصورة إلى Cloudinary. تحقق من المفتاح وإعداد الرفع.'},502);image=await a.json();}
 if(image.public_id!==pid||image.resource_type!=='image'||!String(image.secure_url).startsWith('https://res.cloudinary.com/uot1nayb/image/upload/'))throw new Error('invalid upload');
 const record={id,owner_id:user.id,name,image_url:image.secure_url,public_id:pid,original_bytes:original,stored_bytes:image.bytes};
 const saved=await db('school_image_records?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(record)});if(!saved.ok)return reply({error:'رفعت الصورة ولكن تعذر حفظ السجل. أعد المحاولة بالطلب نفسه.'},502);
 let out=await saved.json();if(!out.length){const r=await db('school_image_records?id=eq.'+id+'&owner_id=eq.'+user.id);out=await r.json();}return reply({record:out[0]});
 }catch{return reply({error:'تعذر إكمال الطلب. احتُفظ بالبيانات لإعادة المحاولة.'},500);}
});
