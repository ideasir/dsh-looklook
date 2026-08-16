#!/usr/bin/env node
/**
 * dsh-docreader parser verification: builds minimal in-memory .docx/.xlsx/
 * .pptx OOXML packages (ZIP + XML, no Office needed), parses them through the
 * built lib, and asserts the extracted text, tables, and images.
 *
 * Run: node scripts/verify-parser.mjs   (after `pnpm run build`)
 */

import { zipSync } from 'fflate'
import { readDocument } from '../lib/parser/index.js'

let passed = 0
function assert(condition, label) {
  if (!condition) throw new Error(`ASSERTION FAILED: ${label}`)
  passed += 1
  console.log(`  ✓ ${label}`)
}

/** Build a ZIP package from { path: string|Uint8Array }. */
function packageBytes(parts) {
  const entries = {}
  for (const [path, content] of Object.entries(parts)) {
    entries[path] = typeof content === 'string' ? new TextEncoder().encode(content) : content
  }
  return zipSync(entries)
}

/** A tiny valid PNG byte header (1x1 transparent pixel is unnecessary; parser only inspects bytes). */
const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])

function docxPackage() {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>季度报告</w:t></w:r></w:p>
    <w:p><w:r><w:t>收入同比增长 25%</w:t></w:r></w:p>
    <w:p><w:r><w:t>配图：</w:t></w:r>
      <w:drawing><a:graphic><a:graphicData><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></w:drawing>
    </w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>季度</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>营收</w:t></w:r></w:p></w:tc></w:tr>
      <w:tr><w:tc><w:p><w:r><w:t>Q1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>100万</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  </w:body>
</w:document>`
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/chart1.png"/>
</Relationships>`
  return {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'word/document.xml': documentXml,
    'word/_rels/document.xml.rels': rels,
    'word/media/chart1.png': PNG,
  }
}

function xlsxPackage() {
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="销售数据" sheetId="1" r:id="rId1"/>
    <sheet name="汇总" sheetId="2" r:id="rId2"/>
  </sheets>
</workbook>`
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
</Relationships>`
  const sharedStrings = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <si><t>产品</t></si>
  <si><t>销量</t></si>
  <si><t>手机</t></si>
</sst>`
  const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>
    <row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2"><v>1200</v></c></row>
  </sheetData>
</worksheet>`
  const sheet2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><v>999</v></c></row>
  </sheetData>
</worksheet>`
  return {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'xl/workbook.xml': workbookXml,
    'xl/_rels/workbook.xml.rels': workbookRels,
    'xl/sharedStrings.xml': sharedStrings,
    'xl/worksheets/sheet1.xml': sheet1,
    'xl/worksheets/sheet2.xml': sheet2,
  }
}

function pptxPackage() {
  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
    <p:sldId id="257" r:id="rId2"/>
  </p:sldIdLst>
</p:presentation>`
  const presentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>
</Relationships>`
  const slide1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>封面：市场分析</a:t></a:r></a:p></p:txBody></p:sp>
    <p:sp><p:txBody><a:p><a:r><a:t>2025 年趋势</a:t></a:r></a:p></p:txBody></p:sp>
  </p:spTree></p:cSld>
</p:sld>`
  const slide1Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId10" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide1.xml"/>
</Relationships>`
  const slide2 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>数据图表</a:t></a:r></a:p></p:txBody></p:sp>
    <p:pic><p:blipFill><a:blip r:embed="rId1"/></p:blipFill></p:pic>
  </p:spTree></p:cSld>
</p:sld>`
  const slide2Rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/pic1.png"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide7.xml"/>
</Relationships>`
  const notes1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>演讲备注：强调增长。</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`
  const notes7 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>第二页备注：独立编号。</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld>
</p:notes>`
  return {
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>',
    'ppt/presentation.xml': presentationXml,
    'ppt/_rels/presentation.xml.rels': presentationRels,
    'ppt/slides/slide1.xml': slide1,
    'ppt/slides/_rels/slide1.xml.rels': slide1Rels,
    'ppt/slides/slide2.xml': slide2,
    'ppt/slides/_rels/slide2.xml.rels': slide2Rels,
    'ppt/notesSlides/notesSlide1.xml': notes1,
    'ppt/notesSlides/notesSlide7.xml': notes7,
    'ppt/media/pic1.png': PNG,
  }
}

async function main() {
  console.log('docx parse')
  {
    const doc = await readDocument(packageBytes(docxPackage()), 'report.docx')
    assert(doc.format === 'docx', 'format detected as docx')
    assert(doc.sections.some(s => s.kind === 'heading' && s.text.includes('季度报告')), 'heading extracted')
    assert(doc.sections.some(s => s.kind === 'paragraph' && s.text.includes('收入同比增长 25%')), 'paragraph text extracted')
    const table = doc.sections.find(s => s.kind === 'table')
    assert(table !== undefined, 'table section present')
    assert(table?.rows?.[1]?.[1] === '100万', 'table cell value extracted')
    assert(doc.images.length === 1 && doc.images[0]?.name === 'chart1.png', 'inline image extracted')
    assert(doc.sections.some(s => (s.imageRefs ?? []).includes(0)), 'image anchored to its section')
  }

  console.log('xlsx parse')
  {
    const doc = await readDocument(packageBytes(xlsxPackage()), 'data.xlsx')
    assert(doc.format === 'xlsx', 'format detected as xlsx')
    const first = doc.sections[0]
    assert(first?.title === '销售数据', 'sheet order and title preserved')
    assert(first?.rows?.[0]?.join('\t') === '产品\t销量', 'shared-string header row extracted')
    assert(first?.rows?.[1]?.[1] === '1200', 'numeric cell extracted')
    assert(doc.sections[1]?.title === '汇总', 'second sheet extracted')
  }

  console.log('xlsx edge cases')
  {
    // Sparse columns, merged cells, date-formatted numbers.
    const sheet1 = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    <row r="1"><c r="A1" t="inlineStr"><is><t>名称</t></is></c><c r="C1" t="inlineStr"><is><t>备注</t></is></c></row>
    <row r="2"><c r="A2" t="inlineStr"><is><t>手机</t></is></c><c r="C2" t="inlineStr"><is><t>缺货</t></is></c></row>
    <row r="3"><c r="A3" s="0" t="n"><v>45658</v></c></row>
  </sheetData>
  <mergeCells count="1"><mergeCell ref="A1:C1"/></mergeCells>
</worksheet>`
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <cellXfs count="1"><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
</styleSheet>`
    const wbXml = `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="边角" sheetId="1" r:id="rId1"/></sheets></workbook>`
    const wbRels = `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type=".../worksheet" Target="worksheets/sheet1.xml"/></Relationships>`
    const doc = await readDocument(zipSync({
      '[Content_Types].xml': new TextEncoder().encode('x'),
      'xl/workbook.xml': new TextEncoder().encode(wbXml),
      'xl/_rels/workbook.xml.rels': new TextEncoder().encode(wbRels),
      'xl/styles.xml': new TextEncoder().encode(styles),
      'xl/worksheets/sheet1.xml': new TextEncoder().encode(sheet1),
    }), 'edge.xlsx')
    const rows = doc.sections[0]?.rows
    // Sparse columns must keep B blank (row 2 is not merged).
    assert(rows?.[1]?.[0] === '手机' && rows[1][1] === '' && rows[1][2] === '缺货', 'sparse columns aligned by reference')
    // Merged A1:C1 anchor value must propagate to B1 and C1.
    assert(rows[0][0] === '名称' && rows[0][1] === '名称' && rows[0][2] === '名称', 'merged cells expanded to anchor value')
    // Date-styled serial 45658 → ISO date.
    assert(rows[2]?.[0] === '2025-01-01', `date serial converted (got "${rows[2]?.[0]}")`)
  }

  console.log('pptx parse')
  {
    const doc = await readDocument(packageBytes(pptxPackage()), 'deck.pptx')
    assert(doc.format === 'pptx', 'format detected as pptx')
    const first = doc.sections.find(s => s.kind === 'slide' && s.title === '第 1 页')
    assert(first?.text.includes('封面：市场分析') && first.text.includes('2025 年趋势'), 'slide shapes extracted as lines')
    const notes = doc.sections.find(s => s.kind === 'notes' && s.title === '第 1 页备注')
    assert(notes?.text.includes('演讲备注'), 'notes slide extracted')
    const notes2 = doc.sections.find(s => s.kind === 'notes' && s.title === '第 2 页备注')
    assert(notes2?.text.includes('独立编号'), 'notes resolved via slide rels, not numbering guess')
    assert(doc.images.length === 1 && doc.images[0]?.name === 'pic1.png', 'slide image extracted')
    const second = doc.sections.find(s => s.kind === 'slide' && s.title === '第 2 页')
    assert(second !== undefined && (second.imageRefs ?? []).includes(0), 'slide image anchored to slide 2')
  }

  console.log(`\nALL ${passed} ASSERTIONS PASSED`)
}

main().catch((error) => {
  console.error('\nVERIFY FAILED:', error)
  process.exit(1)
})
