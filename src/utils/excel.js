// ===================================================================================
// 품질 인증서(품질 보고서) 엑셀(.xlsx) 생성 유틸
// SheetJS(xlsx) 를 번들에 포함하여 오프라인에서도 동작
// ===================================================================================
import * as XLSX from 'xlsx';
import { COMPANY } from '../data/inspectionData';

export function downloadCertificate({ meta, steps, answers }) {

  const failCount = steps.filter((s) => answers[s.id]?.result === 'fail').length;
  const verdict = failCount === 0 ? '적합 (PASS)' : `조건부 / 부적합 항목 ${failCount}건`;
  const certNo = `KNK-${meta.dateCompact}-${String(Math.floor(Math.random() * 9000) + 1000)}`;

  // ---- 시트 데이터(2차원 배열) ----
  const rows = [];
  rows.push([`${COMPANY.nameKo} (${COMPANY.nameEn}) 품질 검증 성적서`]);
  rows.push(['Quality Verification Certificate']);
  rows.push([]);
  rows.push(['성적서 번호', certNo, '', '발행일', meta.date]);
  rows.push(['고객사', meta.customer, '', '모델명', meta.model]);
  rows.push(['검사기 종류', meta.typeLabel, '', '검사자', meta.inspector]);
  rows.push(['종합 판정', verdict]);
  rows.push([]);
  rows.push(['No.', '검사 항목', '규격 기준', '판정', '비고(조치)']);

  steps.forEach((s, i) => {
    const a = answers[s.id] || {};
    const result = a.result === 'pass' ? '양호(예)' : a.result === 'fail' ? '부적합(아니요)' : '-';
    const note = a.result === 'fail' ? (s.action?.grade || '조치 필요') : '';
    rows.push([i + 1, s.title, s.spec || '', result, note]);
  });

  rows.push([]);
  rows.push(['검사자 서명', meta.inspector, '', '품질책임자 승인', '']);
  rows.push([]);
  rows.push([`본 성적서는 ${COMPANY.nameKo}(${COMPANY.nameEn}) 품질 검증 시스템에서 자동 발행되었습니다.`]);

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // 열 너비
  ws['!cols'] = [
    { wch: 16 }, { wch: 34 }, { wch: 30 }, { wch: 16 }, { wch: 22 },
  ];
  // 상단 제목 병합
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '품질검증성적서');

  const fileName = `KNK_품질검증성적서_${meta.model}_${meta.dateCompact}.xlsx`;
  XLSX.writeFile(wb, fileName);
  return { certNo, verdict, fileName };
}
