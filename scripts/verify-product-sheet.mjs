import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
const source=JSON.parse(await readFile('.local/rental-import/source.json','utf8'));
assert.equal(createHash('sha256').update(await readFile('backup/Rental.CharmBless.xlsx')).digest('hex'),source.sha256,'source workbook unchanged');
const sheet=source.sheets.find(s=>s.name==='ข้อมูลสินค้า');
assert(sheet,'product worksheet exists');
const rows=sheet.rows.filter(r=>r.row>1&&r.cells.A);
const client=new MongoClient(process.env.MONGODB_URI,{serverSelectionTimeoutMS:8000});
const number=value=>value!==undefined&&value!==''?Number(value):null;
try{
 await client.connect();const products=await client.db('charmblessrental').collection('products').find({}).toArray();
 assert.equal(products.length,rows.length,'product count');const byId=new Map(products.map(p=>[p.legacyId,p]));let imageMatches=0;
 for(const row of rows){const c=row.cells,p=byId.get(c.A);assert(p,'Product ID '+c.A);assert.equal(p.sku,c.D||'');assert.equal(p.name,c.E||c.D||c.A);assert.equal(p.category,c.C);assert.equal(p.cost,number(c.F));assert.equal(p.legacyRevenue,number(c.G));assert.equal(p.legacyProfit,number(c.H));assert.equal(p.notes,c.I||'');assert.equal(p.inventoryStatus,c.J||'');assert.equal(p.source.sheet,'ข้อมูลสินค้า');assert.equal(p.source.row,row.row);assert.equal(p.source.imagePath,c.B||'');assert.equal(p.source.imageUrl,c.K||'');
  if(c.K){assert.equal(new URL(c.K).searchParams.get('fileName'),c.B);const image=await client.db('charmblessrental').collection('products').findOne({id:p.id},{projection:{images:1}});assert(image.images[0].startsWith(process.env.NEXT_PUBLIC_R2_PUBLIC_URL+'/products/'));imageMatches++;}
 }
 console.log(JSON.stringify({sheet:sheet.name,rows:rows.length,allSourceFieldsMatch:true,imagePathPairsMatch:imageMatches,nonemptySizeFields:products.filter(p=>p.size).length}));
 const login=await fetch('http://localhost:3000/api/admin/session',{method:'POST',headers:{Origin:'http://localhost:3000','Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:process.env.ADMIN_PASSWORD})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const html=await(await fetch('http://localhost:3000/admin/products',{headers:{Cookie:cookie}})).text();
 for(const label of ['Product ID','รูปสินค้า','ประเภท','รหัสสินค้า','ชื่อสินค้า','ต้นทุน','รายได้','กำไร','หมายเหตุ','สถานะปัจจุบัน','Image URL'])assert(html.includes(label),'column '+label);
 for(const label of ['ราคาเช่า / วัน','จำนวนทั้งหมด','ไม่ระบุไซซ์'])assert(!html.includes(label),'no invented column '+label);
 console.log('PASS: inventory table matches the product sheet and does not show size, color, stock or rental-rate columns');
}finally{await client.close();}
