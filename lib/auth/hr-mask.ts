// 주민등록번호 마스킹 — 본인 프로필 화면 등에서 평문 노출을 피하기 위한 표시 변환 헬퍼.
// 평문은 서버 측에서만 사용하고, 본인 응답에는 반드시 이 함수의 결과만 포함시킨다.

export function maskResidentId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = raw.replace(/[^0-9]/g, '')
  if (digits.length < 7) return null
  // YYMMDD-N******  (앞 6자리 + 성별 1자리 + 별표 6개)
  return `${digits.slice(0, 6)}-${digits.slice(6, 7)}******`
}
