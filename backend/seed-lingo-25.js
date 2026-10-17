/**
 * Import 25 sesi SIMULASI ke Firestore, koleksi sessions.
 * Jalankan dari folder backend yang sudah berisi firebase.js dan dependencies.
 *   node seed-lingo-25.js             # preview saja (tidak menulis)
 *   node seed-lingo-25.js --write     # simpan 25 record
 *   node seed-lingo-25.js --delete    # hapus HANYA dokumen DEMO yang tercantum JSON
 *
 * Penulisan memerlukan firebase-service-account.json lokal atau
 * FIREBASE_SERVICE_ACCOUNT_JSON di environment. Jangan unggah kunci ke chat/repo.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const mode = process.argv.includes('--delete') ? 'delete' :
    process.argv.includes('--write') ? 'write' : 'preview';
const filename = path.join(__dirname, 'sessions_25.json');
const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
const numericFields = ['accuracy','attempts','correct','duration','page_number','total_question','wrong'];
function validate(item) {
    if (!/^DEMO_LINGO_202609(10|11)_TK[AB]_\d{2}$/.test(item.document_id)) throw new Error('ID tidak aman: '+item.document_id);
    if (item.fields.is_demo !== true) throw new Error('Data bukan demo');
    if (item.fields.module_id !== 'tantangan_bicara_1') throw new Error('Module invalid');
    if (item.fields.status !== 'graded') throw new Error('Status invalid');
    if (item.fields.correct + item.fields.wrong !== item.fields.attempts) throw new Error('Attempts invalid');
    if (item.fields.accuracy !== 100*item.fields.correct/4) throw new Error('Accuracy invalid');
    numericFields.forEach(k => { if (!Number.isInteger(item.fields[k])) throw new Error('Integer invalid: '+k); });
}
data.forEach(validate);
(async()=> {
  if (mode === 'preview') {
      console.log('PREVIEW, belum ada yang disimpan:');
      console.table(data.map(({document_id,fields:f}) => ({document_id, class:f.class_group, correct:f.correct, wrong:f.wrong, accuracy:f.accuracy, date:f.date})));
      console.log('Untuk menulis: node seed-lingo-25.js --write');
      return;
  }
  const db = require('./firebase'); // file firebase.js dari backend LINGO
  const ref = db.collection('sessions');
  const batch = db.batch();
  for (const item of data) {
      const docRef = ref.doc(item.document_id);
      if (mode === 'delete') {
          // Hanya hapus jika dokumen yang ada memang bertanda demo
          const existing = await docRef.get();
          if (existing.exists && existing.data().is_demo === true) batch.delete(docRef);
      } else {
          // Upsert dengan ID stabil: menjalankan ulang tidak menambah dokumen baru
          batch.set(docRef,item.fields);
      }
  }
  await batch.commit();
  console.log(mode==='write' ? '25 data DEMO tersimpan di sessions.' : 'Data DEMO dibersihkan dari sessions.');
})().catch(e => { console.error(e); process.exitCode=1; });
