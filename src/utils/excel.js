// ===================================================================================
// 품질 인증서(출하 성적서) 엑셀(.xlsx) 생성 유틸
// 서식 출처: 1. PBA 출하 CHECK LIST (R1.0) — [최종 check Sheet]
// SheetJS(xlsx) 를 번들에 포함하여 오프라인에서도 동작
// ===================================================================================
import * as XLSX from 'xlsx';
import { COMPANY } from '../data/inspectionData';

export function downloadCertificate({ meta, steps, answers }) {
  const failCount = steps.filter((s) => answers[s.id]?.result === 'fail').length;
  const verdict = failCount === 0 ? '적합 (PASS)' : `조건부 / 부적합 항목 ${failCount}건`;
  const certNo = `KNK-${meta.dateCompact}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  // ---- 시트 데이터(2차원 배열) : 검사기 점검 Check Sheet 서식 ----
  const rows = [];
  rows.push([`${COMPANY.nameKo} (${COMPANY.nameEn}) 출하 검사 성적서`]);
  rows.push(['검사기 점검 Check Sheet']);
  rows.push([]);
  rows.push(['성적서 번호', certNo, '', '발행일', meta.date]);
  rows.push(['고객사', meta.customer, '', '검사자', meta.inspector]);
  rows.push(['모델명', meta.model, '', '모델 REV.', meta.rev || '-']);
  rows.push(['검사기명', meta.machine || meta.typeLabel, '', '검사기 종류', meta.typeLabel]);
  rows.push(['종합 판정', verdict]);
  rows.push([]);
  rows.push(['NO.', '검사 항목 (Paragraph)', '검사 내용 (Test Description)', '규격치 (Criteria)', '점검 결과 (Result)']);

  steps.forEach((s, i) => {
    const a = answers[s.id] || {};
    const result = a.result === 'pass' ? 'PASS' : a.result === 'fail' ? 'FAIL(부적합)' : '-';
    rows.push([i + 1, s.title, s.question, s.spec || '', result]);
  });

  // 부적합 조치 이력
  const fails = steps.filter((s) => answers[s.id]?.result === 'fail');
  if (fails.length) {
    rows.push([]);
    rows.push(['■ 부적합 조치 이력']);
    fails.forEach((s) => {
      rows.push([s.title, s.action?.grade || '', (s.action?.steps || []).join(' / '), s.action?.ref || '']);
    });
  }

  rows.push([]);
  rows.push(['검사자 서명', meta.inspector, '', '품질책임자 승인', '']);
  rows.push([]);
  rows.push([`본 성적서는 ${COMPANY.nameKo}(${COMPANY.nameEn}) 품질 검증 시스템에서 자동 발행되었습니다.`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 8 }, { wch: 26 }, { wch: 46 }, { wch: 40 }, { wch: 16 },
  ];
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '출하검사성적서');

  const fileName = `KNK_출하검사성적서_${meta.model}_${meta.dateCompact}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { certNo, verdict, fileName };
}
