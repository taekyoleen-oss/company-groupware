/**
 * profile 페이지에서 떼어낸 GPS 관련 코드 스냅샷 (2026-05-22).
 *
 * 이 파일은 빌드에 포함되지 않습니다.
 * 복원 시점에 `app/(app)/profile/page.tsx` 에 아래 블록들을 다시 붙여 넣고
 * `companySettings.attendance_method === 'gps'` 분기를 활성화하세요.
 */

// === 인터페이스 확장 (CompanySettings) =================================
// interface CompanySettings {
//   address: string
//   latitude: number | null
//   longitude: number | null
//   radius_meters: number
//   attendance_method: 'gps' | 'ip'
// }

// === 상태 / 헬퍼 =======================================================
// type GpsStatus = 'idle' | 'checking' | 'near' | 'far' | 'error' | 'no_setting'
//
// function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
//   const R = 6371000
//   const toRad = (deg: number) => (deg * Math.PI) / 180
//   const dLat = toRad(lat2 - lat1)
//   const dLon = toRad(lon2 - lon1)
//   const a =
//     Math.sin(dLat / 2) ** 2 +
//     Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
//   return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
// }
//
// const [gpsStatus, setGpsStatus] = useState<GpsStatus>('idle')
// const [distanceMeters, setDistanceMeters] = useState<number | null>(null)
//
// const checkGps = (settings: CompanySettings) => {
//   if (!settings.latitude || !settings.longitude) { setGpsStatus('no_setting'); return }
//   if (!navigator.geolocation) { setGpsStatus('error'); return }
//   setGpsStatus('checking')
//   navigator.geolocation.getCurrentPosition(
//     (pos) => {
//       const dist = haversineMeters(pos.coords.latitude, pos.coords.longitude, settings.latitude!, settings.longitude!)
//       setDistanceMeters(Math.round(dist))
//       setGpsStatus(dist <= settings.radius_meters ? 'near' : 'far')
//     },
//     () => setGpsStatus('error'),
//     { timeout: 10000, maximumAge: 30000 }
//   )
// }

// === 초기 로드 분기 ====================================================
// if (settingsData.attendance_method === 'ip') {
//   if (!attendanceData) checkIp()
// } else {
//   if (!settingsData.latitude || !settingsData.longitude) setGpsStatus('no_setting')
//   else if (!attendanceData) checkGps(settingsData)
// }

// === 출근 탭 JSX (GPS 분기) ============================================
// {companySettings.attendance_method === 'gps' && (
//   <div className="space-y-3">
//     {gpsStatus === 'no_setting' && (
//       <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2">
//         관리자가 회사 위치를 아직 설정하지 않았습니다.
//       </p>
//     )}
//     {gpsStatus === 'checking' && (
//       <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2 animate-pulse">위치 확인 중...</p>
//     )}
//     {gpsStatus === 'error' && (
//       <p className="text-sm text-red-500 dark:text-red-400 text-center py-2">
//         위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 허용해 주세요.
//       </p>
//     )}
//     {gpsStatus === 'idle' && (
//       <p className="text-sm text-[#6B7280] dark:text-[#94A3B8] text-center py-2">
//         위치 확인 버튼을 눌러 출근 가능 여부를 확인하세요.
//       </p>
//     )}
//     {(gpsStatus === 'near' || gpsStatus === 'far') && distanceMeters !== null && (
//       <div className={cn(
//         'rounded-lg px-4 py-2.5 text-sm flex items-center gap-2',
//         gpsStatus === 'near'
//           ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300'
//           : 'bg-[#F9FAFB] dark:bg-[#0F172A] text-[#6B7280] dark:text-[#94A3B8]'
//       )}>
//         <Navigation className="h-4 w-4 shrink-0" />
//         <span>
//           회사까지 {distanceMeters.toLocaleString()}m
//           {gpsStatus === 'near'
//             ? ' — 출근 가능 범위입니다.'
//             : ` — 반경 ${companySettings.radius_meters}m 이내로 이동하세요.`}
//         </span>
//       </div>
//     )}
//     <div className="flex gap-2">
//       <Button type="button" variant="outline" size="sm" className="flex-none"
//         onClick={() => companySettings && checkGps(companySettings)}
//         disabled={gpsStatus === 'checking'}>
//         <Navigation className="h-3.5 w-3.5 mr-1" />위치 재확인
//       </Button>
//       <Button type="button" className="flex-1" disabled={gpsStatus !== 'near' || checkingIn} onClick={handleCheckIn}>
//         <CheckCircle2 className="h-4 w-4 mr-1.5" />{checkingIn ? '처리 중...' : '출근 확인'}
//       </Button>
//     </div>
//   </div>
// )}

export {}
