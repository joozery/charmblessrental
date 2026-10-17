// Reconcile imported MongoDB data with the unchanged source workbook manifest.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { MongoClient } from 'mongodb';
const manifest=JSON.parse(await readFile('.local/rental-import/source.json','utf8'));
const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
const number=v=>v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
try{
 await client.connect();const db=client.db('charmblessrental');
 const products=await db.collection('products').find({}).toArray();
 const expected=manifest.sheets[0].rows.filter(r=>r.row>1&&r.cells.A);
 assert.equal(products.length,expected.length,'product count');
 const byLegacy=new Map(products.map(p=>[p.legacyId,p]));
 for(const row of expected){const c=row.cells,p=byLegacy.get(c.A);assert(p,`missing ${c.A}`);assert.equal(p.sku,c.D||'');assert.equal(p.name,c.E||c.D||c.A);assert.equal(p.category,c.C||'ไม่ระบุประเภท');assert.equal(p.cost,number(c.F));assert.equal(p.legacyRevenue,number(c.G));assert.equal(p.legacyProfit,number(c.H));assert.equal(p.notes,c.I||'');assert.equal(p.inventoryStatus,c.J||'');assert.equal(p.dailyRate,null);assert(p.images[0].startsWith(process.env.NEXT_PUBLIC_R2_PUBLIC_URL+'/products/')||p.imageStatus==='missing-source');}
 assert.equal(await db.collection('products').countDocuments({id:{$lte:6}}),0,'sample products removed');
 assert.equal(await db.collection('legacyRows').countDocuments({importId:manifest.sha256}),manifest.sheets.reduce((sum,s)=>sum+s.rows.length,0),'all populated and formula-only source rows preserved');
 const raw=await db.collection('legacyRows').find({importId:manifest.sha256}).toArray();
 const byRow=new Map(raw.map(r=>[`${r.sheet}:${r.row}`,r]));
 for(const sheet of manifest.sheets)for(const row of sheet.rows){const stored=byRow.get(`${sheet.name}:${row.row}`);assert(stored);assert.deepEqual(stored.cells,row.cells);assert.deepEqual(stored.formulas,row.formulas);assert.deepEqual(stored.types,row.types);assert.deepEqual(stored.hyperlinks,row.hyperlinks);}
 for(const[index,name,key]of[[1,'rentals','A'],[3,'rentalItems','B'],[5,'bankAccounts','A']]){
  const rows=manifest.sheets[index].rows.filter(r=>r.row>1&&r.cells[key]);
  const actual=await db.collection(name).find({'source.importId':manifest.sha256}).toArray();assert.equal(actual.length,rows.length,name+' count');assert.deepEqual(new Set(actual.map(r=>r.legacyId)),new Set(rows.map(r=>r.cells[key])),name+' IDs');
 }
 const counter=await db.collection('counters').findOne({_id:'products'});assert(counter.sequence>=Math.max(...products.map(p=>p.id)),'future product IDs');
 for(const p of products.filter(p=>p.imageStatus==='uploaded').filter((_,index)=>index%100===0)){
  const image=await fetch(p.images[0],{method:'HEAD',signal:AbortSignal.timeout(15000)});assert.equal(image.status,200,'R2 public image');assert(image.headers.get('content-type').startsWith('image/'));
 }
 const login=await fetch('http://localhost:3000/api/admin/session',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.ADMIN_PASSWORD})});assert.equal(login.status,200,'owner login');const cookie=login.headers.get('set-cookie').split(';')[0];
 const admin=await(await fetch('http://localhost:3000/admin/products',{headers:{Cookie:cookie}})).text();assert(admin.includes(expected[0].cells.D),'admin shows original SKU');assert(admin.includes('ยังไม่ตั้งราคา'),'admin unknown pricing');
 const publicPage=await(await fetch('http://localhost:3000/')).text();assert(publicPage.includes(expected[0].cells.E),'storefront shows actual product');assert(publicPage.includes('สอบถามราคา'),'storefront unknown pricing');assert(!publicPage.includes('legacyRevenue')&&!publicPage.includes('imageUrl')&&!publicPage.includes('passwordHash'),'private fields excluded from public props');assert(!publicPage.includes('Rose Satin Dress'),'sample removed from storefront');
 const p=products.find(p=>p.active);const detail=await(await fetch('http://localhost:3000/products/'+p.image)).text();assert(detail.includes(p.name),'actual product detail');assert(!detail.includes('legacyRevenue'),'no legacy financials on detail');
 console.log('PASS: all source IDs/values, counts, history links, original formulas, sample removal, ID counter, R2 public images, admin UI, storefront UI, private/public field separation');
 console.log(JSON.stringify({products:products.length,images:products.filter(p=>p.imageStatus==='uploaded').length,missing:products.filter(p=>p.imageStatus!=='uploaded').map(p=>p.legacyId),unmatchedProducts:await db.collection('rentalItems').countDocuments({productId:null}),unmatchedRentals:await db.collection('rentalItems').countDocuments({rentalFound:false})}));
}finally{await client.close();}
