/**
 * admin 페이지에서 떼어낸 GPS 관련 코드 스냅샷 (2026-05-22).
 *
 * 이 파일은 빌드에 포함되지 않습니다.
 * 복원 시점에 `app/admin/page.tsx` 에 아래 블록들을 다시 붙여 넣고
 * `attendance_method === 'gps'` 분기 + 방식 토글을 활성화하세요.
 */

// === useCurrentGPS 핸들러 =============================================
// const useCurrentGPS = () => {
//   if (!navigator.geolocation) { showToast('이 브라우저는 GPS를 지원하지 않습니다.', 'error'); return }
//   setGpsLoading(true)
//   navigator.geolocation.getCurrentPosition(
//     (pos) => {
//       setSettings(s => ({ ...s, latitude: pos.coords.latitude, longitude: pos.coords.longitude }))
//       setSettingsDirty(true)
//       setGpsLoading(false)
//       showToast('현재 위치가 입력되었습니다.', 'success')
//     },
//     () => { showToast('위치 정보를 가져올 수 없습니다.', 'error'); setGpsLoading(false) },
//     { enableHighAccuracy: true, timeout: 10000 }
//   )
// }

// === 출근 체크 방식 선택 토글 =========================================
// <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 space-y-3">
//   <div className="flex items-center gap-2 mb-1">
//     <Settings className="h-4 w-4 text-[#2563EB]" />
//     <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">출근 체크 방식</h2>
//   </div>
//   <div className="flex gap-3">
//     {(['gps', 'ip'] as const).map(method => (
//       <button
//         key={method}
//         type="button"
//         onClick={() => { setSettings(s => ({ ...s, attendance_method: method })); setSettingsDirty(true) }}
//         className={`flex-1 flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
//           settings.attendance_method === method
//             ? 'border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1E3A5F] text-[#2563EB] dark:text-[#93C5FD]'
//             : 'border-[#E5E7EB] dark:border-[#334155] text-[#6B7280] dark:text-[#94A3B8] hover:border-[#9CA3AF]'
//         }`}
//       >
//         {method === 'gps' ? <Navigation className="h-4 w-4" /> : <Wifi className="h-4 w-4" />}
//         {method === 'gps' ? 'GPS 위치' : '사무실 IP'}
//       </button>
//     ))}
//   </div>
// </div>

// === GPS 설정 카드 ====================================================
// {settings.attendance_method === 'gps' && (
//   <div className="bg-white dark:bg-[#1E293B] border border-[#E5E7EB] dark:border-[#334155] rounded-xl p-5 space-y-4">
//     <div className="flex items-center gap-2 mb-1">
//       <MapPin className="h-4 w-4 text-[#2563EB]" />
//       <h2 className="text-sm font-semibold text-[#111827] dark:text-[#F1F5F9]">회사 위치 설정</h2>
//     </div>
//     <p className="text-xs text-[#6B7280] dark:text-[#94A3B8]">
//       GPS 출근 체크 기준 위치입니다. 주소와 좌표를 입력하거나 현재 위치를 사용하세요.
//     </p>
//
//     <div>
//       <label className="block text-sm font-medium mb-1">회사 주소</label>
//       <Input
//         value={settings.address}
//         onChange={e => { setSettings(s => ({ ...s, address: e.target.value })); setSettingsDirty(true) }}
//         placeholder="예: 서울시 강남구 테헤란로 123"
//       />
//     </div>
//
//     <div className="grid grid-cols-2 gap-3">
//       <div>
//         <label className="block text-sm font-medium mb-1">위도 (Latitude)</label>
//         <Input
//           type="number"
//           step="any"
//           value={settings.latitude ?? ''}
//           onChange={e => { setSettings(s => ({ ...s, latitude: e.target.value ? Number(e.target.value) : null })); setSettingsDirty(true) }}
//           placeholder="37.123456"
//         />
//       </div>
//       <div>
//         <label className="block text-sm font-medium mb-1">경도 (Longitude)</label>
//         <Input
//           type="number"
//           step="any"
//           value={settings.longitude ?? ''}
//           onChange={e => { setSettings(s => ({ ...s, longitude: e.target.value ? Number(e.target.value) : null })); setSettingsDirty(true) }}
//           placeholder="127.123456"
//         />
//       </div>
//     </div>
//
//     <Button
//       type="button"
//       variant="outline"
//       className="w-full"
//       onClick={useCurrentGPS}
//       disabled={gpsLoading}
//     >
//       <Navigation className="h-4 w-4 mr-2" />
//       {gpsLoading ? 'GPS 확인 중...' : '현재 위치로 자동 입력'}
//     </Button>
//
//     <div>
//       <label className="block text-sm font-medium mb-1">출근 인정 반경 (미터)</label>
//       <Input
//         type="number"
//         min={50}
//         max={5000}
//         value={settings.radius_meters}
//         onChange={e => { setSettings(s => ({ ...s, radius_meters: Number(e.target.value) })); setSettingsDirty(true) }}
//       />
//       <p className="text-xs text-[#6B7280] dark:text-[#94A3B8] mt-1">
//         회사 위치로부터 이 반경 내에서 출근 체크가 가능합니다. (기본: 200m)
//       </p>
//     </div>
//
//     {settings.latitude && settings.longitude && (
//       <div className="rounded-lg bg-[#EFF6FF] dark:bg-[#1E3A5F] border border-[#BFDBFE] dark:border-[#2563EB] px-3 py-2 text-xs text-[#2563EB] dark:text-[#93C5FD]">
//         위치 설정됨: {settings.latitude.toFixed(6)}, {settings.longitude.toFixed(6)}
//         {' · '}반경 {settings.radius_meters}m
//       </div>
//     )}
//   </div>
// )}

export {}
