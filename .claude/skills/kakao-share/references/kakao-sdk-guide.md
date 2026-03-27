# Kakao SDK 연동 가이드 (v2.0 참고용)

> v1.0에서는 클립보드 복사 방식으로 구현. 이 문서는 v2.0 실제 SDK 연동 시 참고.

## SDK 초기화

```html
<!-- app/layout.tsx의 <head>에 추가 -->
<script src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.2/kakao.min.js"
        integrity="sha384-TiCUE00h649CAMonG018J2ujOgDKW/kVWlChEuu4jK2vxfAAD0eZxzCKakxg55G4"
        crossorigin="anonymous"></script>
```

```typescript
// lib/kakao.ts
declare global {
  interface Window {
    Kakao: any
  }
}

export function initKakao() {
  if (typeof window !== 'undefined' && window.Kakao && !window.Kakao.isInitialized()) {
    window.Kakao.init(process.env.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY!)
  }
}
```

## 텍스트 공유

```typescript
window.Kakao.Share.sendDefault({
  objectType: 'text',
  text: shareText,
  link: {
    mobileWebUrl: shareUrl,
    webUrl: shareUrl,
  },
})
```

## 피드 공유 (링크 미리보기 포함, 선택적 구현)

```typescript
window.Kakao.Share.sendDefault({
  objectType: 'feed',
  content: {
    title: title,
    description: description,
    imageUrl: 'https://앱도메인/og-image.png',
    link: {
      mobileWebUrl: shareUrl,
      webUrl: shareUrl,
    },
  },
})
```

## 환경 변수

```
NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY=your_kakao_js_key
```

## 도메인 등록

Kakao Developers 콘솔 → 앱 설정 → 플랫폼 → Web에서 사이트 도메인 등록 필요.
