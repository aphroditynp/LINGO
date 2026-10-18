/**
 * Perbarui 25 dokumen DEMO LINGO Firestore, total 12 kata pada halaman 14.
 * Dari folder backend LINGO (firebase.js sudah dikonfigurasi):
 *   node seed-lingo-25.js                 -> preview SAJA
 *   node seed-lingo-25.js --write         -> perbarui/tambah 25 sesi DEMO
 *   node seed-lingo-25.js --delete        -> hapus hanya DEMO yang ada dalam JSON
 * Script tidak menulis ke database saat dijalankan tanpa --write.
 * Jangan pernah simpan service account JSON ke GitHub.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const options = process.argv.slice(2);
if (options.includes('--write') && options.includes('--delete')) {
  throw new Error('Pilih salah satu dari --write atau --delete');
}
const mode = options.includes('--delete') ? 'delete' :
             options.includes('--write') ? 'write' : 'preview';
const filename = path.join(__dirname, 'sessions_25.json');
const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
if (!Array.isArray(data) || data.length !== 25) {
  throw new Error('Expected exactly 25 documents');
}
const ids = new Set();
const numbers = ['accuracy','attempts','correct','duration','page_number','total_question','wrong'];
const wordNames = ['itu','aku','bima','lula','beli','buku','bola','baru','selasa','selama','kamera','lemari'];
const classTotals = {};
for (const item of data) {
  const f = item.fields || {};
  if (!/^DEMO_LINGO_202609(10|11)_TK[AB]_\d{2}$/.test(item.document_id) ||
      ids.has(item.document_id) || f.is_demo !== true) {
    throw new Error('Invalid DEMO document: '+item.document_id);
  }
  ids.add(item.document_id);
  numbers.forEach(k => { if (!Number.isInteger(f[k])) throw new Error('Not integer: '+k); });
  if (f.total_question !== 12 || f.page_number !== 14 ||
      f.module_id !== 'tantangan_bicara_1' || f.status !== 'graded' ||
      !Array.isArray(f.word_results) || f.word_results.length !== 12 ||
      f.accuracy !== Math.round(100*f.correct/12) ||
      f.correct + f.wrong !== f.attempts) throw new Error('Invalid session totals: '+item.document_id);
  let ok=0, wrong=0, attempts=0;
  for (let i=0;i<12;i++) {
    const w=f.word_results[i];
    if (w.word!==wordNames[i] || w.attempts<1 || w.attempts>3 ||
        w.wrong !== (w.correct ? w.attempts-1 : 3) ||
        (!w.correct && w.attempts!==3)) throw new Error('Invalid word result: '+item.document_id);
    ok += w.correct ? 1:0; wrong+=w.wrong; attempts+=w.attempts;
  }
  if (ok!==f.correct || wrong!==f.wrong || attempts!==f.attempts) throw new Error('Word totals invalid: '+item.document_id);
  const group=f.class_group+'|'+f.performance_group;
  classTotals[group]=(classTotals[group]||0)+1;
}
const expected={'TK B|bagus':7,'TK B|sedang':6,'TK A|bagus':3,'TK A|rendah':9};
for (const [k, v] of Object.entries(expected)) {
  if (classTotals[k]!==v) throw new Error('Group count invalid: '+k);
}
(async () => {
  if (mode==='preview') {
    console.log('PREVIEW ONLY — no Firebase writes');
    console.table(data.map(({document_id,fields:f}) => ({document_id, kelompok:f.class_group,
       peserta:f.participant_code, kategori:f.performance_group, benar:f.correct,
       total:f.total_question, salah:f.wrong, attempts:f.attempts, accuracy:f.accuracy})));
    console.log('Run `node seed-lingo-25.js --write` to upsert the DEMO records');
    return;
  }
  // firebase.js is the EXISTING backend LINGO Firebase Admin SDK setup.
  const db = require('./firebase');
  const collection=db.collection('sessions');
  const batch=db.batch();
  let total = 0;
  for (const item of data) {
    const docRef=collection.doc(item.document_id);
    const current=await docRef.get();
    if (current.exists && current.data()?.is_demo !== true) {
      throw new Error('Refusing to overwrite/delete non-DEMO document: '+item.document_id);
    }
    if (mode==='delete') {
      if (current.exists) {batch.delete(docRef);total++;}
    } else {
      batch.set(docRef,item.fields);total++;
    }
  }
  if (total) await batch.commit();
  console.log(`SUCCESS: ${mode}: ${total} DEMO documents. (collection: sessions)`);
})().catch(e=>{console.error(e);process.exitCode=1});
