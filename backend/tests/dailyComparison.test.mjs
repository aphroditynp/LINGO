import assert from 'node:assert/strict';
import test from 'node:test';
import { compareDays, gradedSessions, sessionDateKey } from '../src/components/dailyComparisonUtils.js';

const item = (participant_code, date, accuracy, module_id='tantangan_bicara_1', total_question=4, extra={}) => ({
  user_id:'same-parent-id',participant_code,date,accuracy,module_id,module:'Tantangan Bicara 1',
  total_question,correct:Math.round(accuracy*total_question/100),wrong:accuracy===100?0:2,
  attempts:4,status:'graded',page_number:14,...extra,
});

test('Tanggal ISO ditafsirkan WIB, bukan UTC', () => {
  assert.equal(sessionDateKey('2026-09-10T17:30:00.000Z'),'2026-09-11');
  assert.equal(sessionDateKey('2026-09-10T04:00:00.000Z'),'2026-09-10');
});
test('Perkembangan memakai peserta + modul yang sama saja', () => {
  const data=[item('TKB-01','2026-09-15T03:00:00Z',50),item('TKB-01','2026-09-16T03:00:00Z',100),
    item('TKB-02','2026-09-15T04:00:00Z',100),item('TKA-01','2026-09-16T04:00:00Z',25)];
  const output=compareDays(data,'2026-09-15','2026-09-16');
  assert.equal(output.matches.length,1);
  assert.equal(output.delta,50);
  assert.equal(output.leftDaily.count,2);
  assert.equal(output.rightDaily.count,2);
  assert.equal(output.leftUnmatched,1);
  assert.equal(output.rightUnmatched,1);
});
test('Hari yang berbeda kelas tidak boleh diberi klaim kemajuan', () => {
  const output=compareDays([item('TKB-01','2026-09-10',80), item('TKA-01','2026-09-11',20)],'2026-09-10','2026-09-11');
  assert.equal(output.matches.length,0);
  assert.equal(output.delta,null);
});
test('Sesi terakhir dipakai bila ada pengulangan', () => {
  const output=compareDays([item('p1','2026-09-15T01:00:00Z',25), item('p1','2026-09-15T05:00:00Z',75), item('p1','2026-09-16T05:00:00Z',100)],'2026-09-15','2026-09-16');
  assert.equal(output.matches.length,1);
  assert.equal(output.delta,25);
});
test('Jumlah soal tidak setara tidak dibandingkan', () => {
  const output=compareDays([item('p1','2026-09-15',75,'mod1',4), item('p1','2026-09-16',75,'mod1',12)],'2026-09-15','2026-09-16');
  assert.equal(output.mismatchedQuestions,1);
  assert.equal(output.matches.length,0);
});
test('pending_model dan skor kosong tidak dianggap 0', () => {
  const a = item('p1','2026-09-15',0); a.status='pending_model';
  const b = item('p1','2026-09-16',0); b.accuracy=null;
  assert.equal(gradedSessions([a,b]).length,0);
});
test('Filter per modul membandingkan hanya modul terpilih', () => {
  const a=item('p1','2026-09-15',50,'a'); const b=item('p1','2026-09-16',75,'a');
  const c=item('p1','2026-09-15',100,'b'); const d=item('p1','2026-09-16',0,'b');
  assert.equal(compareDays([a,b,c,d],'2026-09-15','2026-09-16','a').delta,25);
});
