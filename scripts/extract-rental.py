from zipfile import ZipFile
import xml.etree.ElementTree as E
from pathlib import Path
import json,hashlib
source=Path('backup/Rental.CharmBless.xlsx'); ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with ZipFile(source) as z:
 strings=[''.join(t.itertext()) for t in E.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
 sheets=[]
 for index,sheet in enumerate(E.fromstring(z.read('xl/workbook.xml')).findall('s:sheets/s:sheet',ns),1):
  rows=[]
  root=E.fromstring(z.read(f'xl/worksheets/sheet{index}.xml'))
  relpath=f'xl/worksheets/_rels/sheet{index}.xml.rels'
  relationships={rel.attrib['Id']:rel.attrib['Target'] for rel in E.fromstring(z.read(relpath))} if relpath in z.namelist() else {}
  hyperlinks={h.attrib['ref']:relationships.get(h.attrib.get('{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'),h.attrib.get('location','')) for h in root.findall('s:hyperlinks/s:hyperlink',ns)}
  for r in root.findall('s:sheetData/s:row',ns):
   cells={};formulas={};types={};links={}
   for c in r:
    v=c.find('s:v',ns);value=v.text if v is not None else ''.join(c.find('s:is',ns).itertext()) if c.find('s:is',ns) is not None else ''
    if c.attrib.get('t')=='s':value=strings[int(value)]
    column=''.join(x for x in c.attrib['r'] if x.isalpha())
    if value:
     cells[column]=value;types[column]=c.attrib.get('t','n')
    formula=c.find('s:f',ns)
    if formula is not None:formulas[column]=formula.text or ''
    if c.attrib['r'] in hyperlinks:links[column]=hyperlinks[c.attrib['r']]
   if cells or formulas:rows.append({'row':int(r.attrib['r']),'cells':cells,'formulas':formulas,'types':types,'hyperlinks':links})
  sheets.append({'name':sheet.attrib['name'],'rows':rows})
 manifest={'file':source.name,'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sheets':sheets}
 output=Path('.local/rental-import/source.json');output.parent.mkdir(parents=True,exist_ok=True)
 output.write_text(json.dumps(manifest,ensure_ascii=False))
 print(json.dumps({'file':str(output),'sheets':{s['name']:len(s['rows']) for s in sheets}},ensure_ascii=False))
