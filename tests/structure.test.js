import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const domSource = fs.readFileSync(path.join(here, '..', 'src', 'dom.js'), 'utf8');
const persistence = fs.readFileSync(path.join(here, '..', 'src', 'persistence.js'), 'utf8');

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function findTagEnd(source, start) {
  let quote = '';
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  throw new Error(`Unterminated HTML tag at ${start}`);
}

function parseTag(raw) {
  let i = 0;
  while (/\s/.test(raw[i] || '')) i += 1;
  const nameStart = i;
  while (i < raw.length && !/[\s/>]/.test(raw[i])) i += 1;
  const name = raw.slice(nameStart, i).toLowerCase();
  const attrs = new Map();
  let selfClosing = false;
  while (i < raw.length) {
    while (/\s/.test(raw[i] || '')) i += 1;
    if (i >= raw.length) break;
    if (raw[i] === '/') {
      selfClosing = true;
      i += 1;
      continue;
    }
    const attrStart = i;
    while (i < raw.length && !/[\s=/>]/.test(raw[i])) i += 1;
    const attrName = raw.slice(attrStart, i).toLowerCase();
    if (!attrName) {
      i += 1;
      continue;
    }
    while (/\s/.test(raw[i] || '')) i += 1;
    let value = '';
    if (raw[i] === '=') {
      i += 1;
      while (/\s/.test(raw[i] || '')) i += 1;
      const quote = raw[i];
      if (quote === '"' || quote === "'") {
        i += 1;
        const valueStart = i;
        while (i < raw.length && raw[i] !== quote) i += 1;
        value = raw.slice(valueStart, i);
        if (raw[i] === quote) i += 1;
      } else {
        const valueStart = i;
        while (i < raw.length && !/[\s>]/.test(raw[i])) i += 1;
        value = raw.slice(valueStart, i).replace(/\/$/, '');
      }
    }
    if (!attrs.has(attrName)) attrs.set(attrName, value);
  }
  return { name, attrs, selfClosing };
}

function parseHtmlElements(source) {
  const root = { name: '#document', attrs: new Map(), children: [] };
  const stack = [root];
  let cursor = 0;
  while (cursor < source.length) {
    const open = source.indexOf('<', cursor);
    if (open < 0) break;
    if (source.startsWith('<!--', open)) {
      const endComment = source.indexOf('-->', open + 4);
      if (endComment < 0) throw new Error('Unterminated HTML comment');
      cursor = endComment + 3;
      continue;
    }
    if (source[open + 1] === '!' || source[open + 1] === '?') {
      cursor = findTagEnd(source, open + 1) + 1;
      continue;
    }
    const end = findTagEnd(source, open + 1);
    const raw = source.slice(open + 1, end);
    if (/^\s*\//.test(raw)) {
      const closeName = raw.replace(/^\s*\//, '').trim().toLowerCase();
      let match = stack.length - 1;
      while (match > 0 && stack[match].name !== closeName) match -= 1;
      if (match > 0) stack.length = match;
      cursor = end + 1;
      continue;
    }
    const token = parseTag(raw);
    if (!token.name) {
      cursor = end + 1;
      continue;
    }
    const node = { name: token.name, attrs: token.attrs, children: [] };
    stack[stack.length - 1].children.push(node);
    if (!token.selfClosing && !VOID_ELEMENTS.has(token.name)) stack.push(node);
    cursor = end + 1;
  }
  return root;
}

function flattenElements(node, out = []) {
  for (const child of node.children) {
    out.push(child);
    flattenElements(child, out);
  }
  return out;
}

function extractDomReferenceIds(source) {
  const ids = [];
  const needle = 'getElementById';
  let cursor = 0;
  while ((cursor = source.indexOf(needle, cursor)) >= 0) {
    let i = cursor + needle.length;
    while (/\s/.test(source[i] || '')) i += 1;
    if (source[i] !== '(') {
      cursor += needle.length;
      continue;
    }
    i += 1;
    while (/\s/.test(source[i] || '')) i += 1;
    const quote = source[i];
    assert.ok(quote === '"' || quote === "'", `getElementById at ${cursor} must use a static string`);
    i += 1;
    const start = i;
    while (i < source.length && source[i] !== quote) {
      if (source[i] === '\\') i += 1;
      i += 1;
    }
    assert.equal(source[i], quote, `unterminated getElementById string at ${cursor}`);
    ids.push(source.slice(start, i));
    cursor = i + 1;
  }
  return ids;
}

const documentRoot = parseHtmlElements(html);
const elements = flattenElements(documentRoot);
const htmlIds = new Map();
for (const element of elements) {
  const id = element.attrs.get('id');
  if (id) htmlIds.set(id, [...(htmlIds.get(id) || []), element]);
}

test('control panel uses accessible native accordion sections without changing control ids', () => {
  const sections = [...html.matchAll(/<details\s+id="([^"]+)"([^>]*)>/g)];
  assert.equal(sections.length, 7);
  assert.deepEqual(
    sections.map(([, id]) => id),
    ['figureSection', 'poseSection', 'appearanceSection', 'poseToolsSection', 'exportSection', 'propsSection', 'sceneSection'],
  );
  assert.deepEqual(
    sections.filter(([, , attrs]) => /\bopen\b/.test(attrs)).map(([, id]) => id),
    ['figureSection', 'poseSection', 'appearanceSection'],
  );
  for (const [, id] of sections) {
    const block = html.match(new RegExp(`<details\\s+id="${id}"[\\s\\S]*?<\\/details>`))?.[0] || '';
    assert.match(block, /<summary>[^<]+<\/summary>/, `${id} must have a keyboard-operable summary`);
  }

  const requiredIds = [
    'panel',
    'figureSelect',
    'rotX',
    'rotY',
    'rotZ',
    'skinToneSelect',
    'outfitSelect',
    'presetSelect',
    'customPoseSelect',
    'viewSelect',
    'propSelect',
    'currentPropSelect',
    'saveFileBtn',
    'loadFileBtn',
    'glbFileInput',
    'glbAssetName',
    'glbLicenseType',
    'glbAuthor',
    'glbSource',
    'glbLicenseNotes',
    'glbLicenseConfirm',
    'importGlbBtn',
    'assetImportStatus',
    'assetSummary',
    'glbMappingPanel',
    'glbSkeletonDiagnostic',
    'glbSkeletonSelect',
    'glbManualMapping',
    'glbMappingRows',
    'glbMappingPresetName',
    'glbMappingPresetSelect',
    'glbMappingPresetSaveBtn',
    'glbMappingPresetApplyBtn',
    'glbMappingPresetDeleteBtn',
    'glbMappingCancelBtn',
  ];
  for (const id of requiredIds) {
    const occurrences = html.match(new RegExp(`\\bid="${id}"`, 'g')) || [];
    assert.equal(occurrences.length, 1, `${id} must exist exactly once`);
  }
});

test('GLB import form is .glb-only, acknowledged, and visibly reports status', () => {
  const file = htmlIds.get('glbFileInput')?.[0];
  assert.equal(file?.attrs.get('accept'), '.glb,model/gltf-binary');
  assert.equal(htmlIds.get('glbLicenseConfirm')?.[0]?.attrs.get('type'), 'checkbox');
  assert.equal(htmlIds.get('assetImportStatus')?.[0]?.attrs.get('role'), 'status');
  assert.equal(htmlIds.get('assetSummary')?.[0]?.attrs.get('aria-live'), 'polite');
  const uiSource = fs.readFileSync(path.join(here, '..', 'src', 'ui.js'), 'utf8');
  assert.doesNotMatch(uiSource, /assetSummary\.innerHTML/);
  assert.match(uiSource, /validateLicenseMetadata/);
  assert.match(uiSource, /validateManualMapping/);
  assert.match(uiSource, /disposeParsedGltf/);
  assert.equal(htmlIds.get('glbMappingPanel')?.[0]?.attrs.get('aria-labelledby'), 'glbMappingHeading');
  assert.equal(htmlIds.get('glbSkeletonDiagnostic')?.[0]?.attrs.get('role'), 'status');
});

test('HTML ids are globally unique and every centralized DOM reference resolves exactly once', () => {
  for (const [id, nodes] of htmlIds) {
    assert.equal(nodes.length, 1, `duplicate HTML id: ${id}`);
  }
  const domIds = extractDomReferenceIds(domSource);
  assert.ok(domIds.length > 0);
  for (const id of domIds) {
    assert.equal(htmlIds.get(id)?.length, 1, `dom.js references missing/non-unique id: ${id}`);
  }
  assert.equal(new Set(domIds).size, domIds.length, 'dom.js should not register duplicate references');
});

test('each details section starts with its summary as the first direct element child', () => {
  for (const details of elements.filter((node) => node.name === 'details')) {
    assert.equal(details.children[0]?.name, 'summary', `${details.attrs.get('id')} summary must be first`);
    assert.equal(
      details.children.filter((node) => node.name === 'summary').length,
      1,
      `${details.attrs.get('id')} must have exactly one direct summary`,
    );
  }
});

test('range controls expose Traditional Chinese accessible names', () => {
  for (const id of ['rotX', 'rotY', 'rotZ', 'propRotY', 'propScale']) {
    const label = htmlIds.get(id)?.[0]?.attrs.get('aria-label') || '';
    assert.match(label, /旋轉|縮放/, `${id} must provide an accessible name`);
  }
});

test('initial panel opens only the three common sections and bulk prop restore stays unselected', () => {
  const openSections = [...html.matchAll(/<details\s+id="([^\"]+)"([^>]*)>/g)]
    .filter(([, , attrs]) => /\bopen\b/.test(attrs))
    .map(([, id]) => id);
  assert.deepEqual(openSections, ['figureSection', 'poseSection', 'appearanceSection']);
  assert.doesNotMatch(
    html.match(/<details\s+id="propsSection"[\s\S]*?<\/details>/)?.[0] || '',
    /<details[^>]*\bopen\b/,
  );
  assert.match(
    persistence,
    /for\s*\(const pd of rawProps\)\s+addProp\(pd\.type, pd, \{\s*select:\s*false,\s*notify:\s*false\s*\}\)/,
  );
  assert.match(persistence, /notifyPropsChange\(\{\s*bulk:\s*true\s*\}\)/);
  assert.match(persistence, /mapping:\s*normalized\.assetRef\.mapping/);
});
