// Run: python3 scripts/extract-rental.py
// Then: node --env-file=.env.local scripts/import-rental.mjs [--commit]
// Private source data, image checkpoints and rollback snapshots stay in .local/.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import assert from 'node:assert/strict';
const directory='.local/rental-import';
const source=JSON.parse(await readFile(`${directory}/source.json`,'utf8'));
const batch=source.sha256;
const records=source.sheets[0].rows.filter(r=>r.row>1&&r.cells.A);
assert.equal(new Set(records.map(r=>r.cells.A)).size,records.length,'Duplicate product ids in source');
const summary={products:records.length,sheets:Object.fromEntries(source.sheets.map(s=>[s.name,s.rows.length]))};
if(!process.argv.includes('--commit')&&!process.argv.includes('--sync-source')){console.log(JSON.stringify(summary,null,2));process.exit(0);}
await mkdir(directory,{recursive:true});
const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
const r2=new S3Client({region:'auto',endpoint:process.env.R2_ENDPOINT,credentials:{accessKeyId:process.env.R2_ACCESS_KEY_ID,secretAccessKey:process.env.R2_SECRET_ACCESS_KEY}});
const base=process.env.NEXT_PUBLIC_R2_PUBLIC_URL.replace(/\/$/,'');
let checkpoint={};try{checkpoint=JSON.parse(await readFile(`${directory}/images.json`,'utf8'));}catch{}
const number=v=>v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const excelDate=v=>number(v)===null?null:new Date(Date.UTC(1899,11,30)+Number(v)*86400000);
const nonRental=new Set(['โปรโมชั่น','ฝากร้าน','ค่าปรับ','เครดิต','การจ่ายเงิน']);
const failed=[];const imported=[];let done=0;
async function migrateImage(record){
 const c=record.cells;
 if(checkpoint[c.A]?.source===c.K&&checkpoint[c.A]?.url)return checkpoint[c.A];
 if(!c.K)return {url:'/images/product-placeholder.svg',status:'missing-source'};
 for(let attempt=0;attempt<3;attempt++){
  try{
   const sourceURL=new URL(c.K);assert(['www.appsheet.com','appsheet.com'].includes(sourceURL.hostname),'Unexpected image source host');
   const response=await fetch(sourceURL,{signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw new Error(`HTTP_${response.status}`);
   const bytes=Buffer.from(await response.arrayBuffer());assert(bytes.length>0&&bytes.length<20*1024*1024,'Invalid image size');
   let extension,type;
   if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255){extension='jpg';type='image/jpeg';}
   else if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))){extension='png';type='image/png';}
   else if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP'){extension='webp';type='image/webp';}
   else throw new Error('SOURCE_NOT_IMAGE');
   const hash=createHash('sha256').update(bytes).digest('hex');const key=`products/${hash}.${extension}`;
   await r2.send(new PutObjectCommand({Bucket:process.env.R2_BUCKET,Key:key,Body:bytes,ContentLength:bytes.length,ContentType:type,CacheControl:'public, max-age=31536000, immutable'}));
   const result={url:`${base}/${key}`,source:c.K,status:'uploaded',bytes:bytes.length,sha256:hash};
   checkpoint[c.A]=result;writeFileSync(`${directory}/images.json`,JSON.stringify(checkpoint,null,2),{mode:0o600});return result;
  }catch(error){if(attempt===2){failed.push({legacyId:c.A,row:record.row,error:error.name==='TimeoutError'?'timeout':String(error.message).slice(0,100)});return {url:'/images/product-placeholder.svg',status:'failed'};}}
 }
}
try{
 await client.connect();const db=client.db('charmblessrental');
 if(process.argv.includes('--sync-source')){
  const raw=[];for(const sheet of source.sheets)for(const row of sheet.rows)raw.push({updateOne:{filter:{importId:batch,sheet:sheet.name,row:row.row},update:{$set:{importId:batch,sheet:sheet.name,...row}},upsert:true}});
  const existingCount=await db.collection('legacyRows').countDocuments({importId:batch});
  const metadataCount=await db.collection('legacyRows').countDocuments({importId:batch,formulas:{$exists:true},types:{$exists:true},hyperlinks:{$exists:true}});
  console.log('Existing source rows:',existingCount,'with metadata:',metadataCount,'expected:',raw.length);
  if(existingCount!==raw.length||metadataCount!==raw.length){
   await db.collection('legacyRows').bulkWrite(raw);console.log('Source metadata preserved:',raw.length,'rows');
  }else console.log('Source metadata already complete; no changes made.');
 }else if(await db.collection('imports').findOne({_id:batch,status:'complete'})){console.log('This source has already been imported; no changes made.');process.exitCode=0;}
 else{
  const old=await db.collection('products').find({}).toArray();
  await writeFile(`${directory}/products-before-${batch.slice(0,12)}.json`,JSON.stringify(old,null,2),{mode:0o600});
  if(old.length)await db.collection('productBackups').bulkWrite(old.map(p=>({updateOne:{filter:{importId:batch,originalId:p.id},update:{$setOnInsert:{importId:batch,originalId:p.id,product:p,createdAt:new Date()}},upsert:true}})));
  // Parallel workers process independent images; checkpoint makes retries resumable.
  let cursor=0;await Promise.all(Array.from({length:6},async()=>{while(cursor<records.length){const index=cursor++;const record=records[index],c=record.cells;const image=await migrateImage(record);const id=1001+index;
   imported[index]={id,legacyId:c.A,sku:c.D||'',name:c.E||c.D||c.A,thai:c.E||c.D||c.A,category:c.C||'ไม่ระบุประเภท',tag:c.C||'ไม่ระบุประเภท',color:'',size:'',dailyRate:null,deposit:null,stock:1,active:!!c.E&&!nonRental.has(c.C),image:`legacy-${c.A.toLowerCase().replace(/[^a-z0-9-]/g,'-')}`,images:[image.url],description:c.I||'',notes:c.I||'',cost:number(c.F),legacyRevenue:number(c.G),legacyProfit:number(c.H),inventoryStatus:c.J||'',imageStatus:image.status,source:{importId:batch,sheet:source.sheets[0].name,row:record.row,imagePath:c.B||'',imageUrl:c.K||''}};
   if(++done%25===0||done===records.length)console.log(`Images processed ${done}/${records.length}; download failures ${failed.length}`);
  }}));
  assert.equal(imported.length,records.length);assert.equal(new Set(imported.map(p=>p.id)).size,records.length);
  const byLegacy=new Map(imported.map(p=>[p.legacyId,p.id]));
  const stagingName=`products_import_${batch.slice(0,12)}`;const staging=db.collection(stagingName);
  await staging.createIndex({id:1},{unique:true});await staging.createIndex({legacyId:1},{unique:true,sparse:true});await staging.createIndex({sku:1});
  await staging.bulkWrite(imported.map(p=>({replaceOne:{filter:{legacyId:p.legacyId},replacement:p,upsert:true}})));
  assert.equal(await staging.countDocuments(),records.length);
  // Preserve every populated source cell, including cached error values and report sheets.
  const raw=[];for(const sheet of source.sheets)for(const row of sheet.rows)raw.push({updateOne:{filter:{importId:batch,sheet:sheet.name,row:row.row},update:{$set:{importId:batch,sheet:sheet.name,...row}},upsert:true}});
  await db.collection('legacyRows').createIndex({importId:1,sheet:1,row:1},{unique:true});await db.collection('legacyRows').bulkWrite(raw);
  const rentalRows=source.sheets[1].rows.filter(r=>r.row>1&&r.cells.A);const itemRows=source.sheets[3].rows.filter(r=>r.row>1&&r.cells.B);const bankRows=source.sheets[5].rows.filter(r=>r.row>1&&r.cells.A);
  const rentalIds=new Set(rentalRows.map(r=>r.cells.A));
  for(const [name,rows,key,convert] of [
   ['rentals',rentalRows,'A',c=>({legacyId:c.A,enteredAt:excelDate(c.B),legacyStatus:c.C||'',customerName:c.D||'',phone:c.E||'',address:c.F||'',shipDate:excelDate(c.G),returnDate:excelDate(c.H),rentalDateText:c.I||'',days:number(c.J),rentalTotal:number(c.K),deposit:number(c.L),shipping:number(c.M),total:number(c.N),bankId:c.O||'',paidAt:excelDate(c.P),slips:[c.Q,c.R,c.S,c.T,c.U].filter(Boolean),carrier:c.V||'',notes:c.W||'',enteredBy:c.Y||''})],
   ['rentalItems',itemRows,'B',c=>({legacyId:c.B,rentalId:c.A||'',productLegacyId:c.C||'',productId:byLegacy.get(c.C)||null,sku:c.D||'',productName:c.E||'',agreedPrice:number(c.F),notes:c.G||'',rentalFound:rentalIds.has(c.A)})],
   ['bankAccounts',bankRows,'A',c=>({legacyId:c.A,name:c.C||'',accountNumber:c.D||'',accountHolder:c.E||'',imageSource:c.B||'',qrPath:c.F||'',qrSource:c.H||'',notes:c.G||''})]
  ]){await db.collection(name).createIndex({legacyId:1},{unique:true});if(rows.length)await db.collection(name).bulkWrite(rows.map(r=>({updateOne:{filter:{legacyId:r.cells[key]},update:{$set:{...convert(r.cells),source:{importId:batch,sheetRow:r.row}}},upsert:true}})));}
  // Swap only after image migration, source preservation and row reconciliation succeed.
  await staging.rename('products',{dropTarget:true});
  await db.collection('counters').updateOne({_id:'products'},{$max:{sequence:Math.max(...imported.map(p=>p.id))}},{upsert:true});
  const report={...summary,importId:batch,completedAt:new Date(),uploaded:imported.filter(p=>p.imageStatus==='uploaded').length,missingImages:imported.filter(p=>p.imageStatus==='missing-source').map(p=>p.legacyId),failedImages:failed,active:imported.filter(p=>p.active).length,missingNames:imported.filter(p=>!records.find(r=>r.cells.A===p.legacyId)?.cells.E).map(p=>p.legacyId),unmatchedItemProducts:itemRows.filter(r=>!byLegacy.has(r.cells.C)).length,unmatchedItemRentals:itemRows.filter(r=>!rentalIds.has(r.cells.A)).length,pricesUnset:imported.length};
  await db.collection('imports').updateOne({_id:batch},{$set:{...report,status:'complete'}},{upsert:true});
  await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2),{mode:0o600});console.log(JSON.stringify(report,null,2));
 }
}finally{await client.close();r2.destroy();}
